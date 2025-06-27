import { Plugin, PluginManifest, PluginContext } from '../../types';
import {
  QueryEvent,
  QueryRecord,
  ResponseRecord,
  OptimizationSuggestion
} from '../../types/events';
import { LRUCache } from 'lru-cache';

interface CategoryResult {
  category: string;
  complexity: 'low' | 'medium' | 'high';
}

interface CategorizationPattern {
  name: string;
  category: string;
  patterns: string[];
  priority: number;
}

export class QueryCollectorPlugin implements Plugin {
  name = 'query-collector';
  version = '1.0.0';
  manifest: PluginManifest = {
    name: 'query-collector',
    version: '1.0.0',
    description: 'Collects and analyzes queries for optimization opportunities',
    dependencies: [],
    priority: 50,
    timeout: 5000,
    capabilities: ['query-analysis', 'optimization-suggestions']
  };

  private cache: LRUCache<string, CategoryResult>;
  private patterns: Map<string, string[]>;
  private customPatterns?: CategorizationPattern[];
  private queryData: Map<string, { category: string; complexity: string; tokenCount: number; model: string }>;
  private initialized = false;

  constructor() {
    this.cache = new LRUCache<string, CategoryResult>({
      max: 1000,
      ttl: 1000 * 60 * 60 // 1 hour TTL
    });

    this.patterns = new Map([
      ['code', ['create', 'write', 'implement', 'build', 'function', 'class', 'code', 'program', 'develop']],
      ['debug', ['error', 'fix', 'bug', 'issue', 'problem', 'debug', 'troubleshoot', 'resolve']],
      ['explanation', ['explain', 'how', 'what', 'why', 'describe', 'understand', 'tell me']],
      ['refactor', ['refactor', 'improve', 'optimize', 'clean', 'restructure', 'redesign']],
      ['test', ['test', 'unit test', 'integration', 'spec', 'testing', 'mock', 'suite']]
    ]);

    this.queryData = new Map();
  }

  async initialize(context: PluginContext): Promise<void> {
    context.logger.info({ plugin: this.name }, 'Initializing query collector plugin');

    // Load custom categorization patterns if provided
    if (context.config.categorizationPatterns) {
      this.customPatterns = context.config.categorizationPatterns;
    }

    this.initialized = true;
    context.logger.info({ plugin: this.name }, 'Query collector plugin initialized');
  }

  async onEvent(event: QueryEvent, context: PluginContext): Promise<void> {
    try {
      switch (event.type) {
        case 'query':
          await this.handleQueryEvent(event, context);
          break;
        case 'response':
          await this.handleResponseEvent(event, context);
          break;
        case 'error':
          await this.handleErrorEvent(event, context);
          break;
      }
    } catch (error) {
      // Never throw from onEvent
      context.logger.error({
        error: error instanceof Error ? error.message : String(error),
        eventId: event.id,
        eventType: event.type
      }, 'Error processing event in query collector');
    }
  }

  async shutdown(): Promise<void> {
    this.cache.clear();
    this.queryData.clear();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private async handleQueryEvent(event: QueryEvent, context: PluginContext): Promise<void> {
    const { data, metadata } = event;

    if (!data || !data.messages && !data.content) {
      context.logger.error({ eventId: event.id }, 'Missing query data');
      return;
    }

    // Extract query text
    let query = '';
    if (data.content) {
      query = data.content;
    } else if (data.messages && Array.isArray(data.messages)) {
      // Find the last user message
      for (let i = data.messages.length - 1; i >= 0; i--) {
        if (data.messages[i].role === 'user') {
          query = data.messages[i].content;
          break;
        }
      }
    }

    if (!query) {
      context.logger.error({ eventId: event.id }, 'Could not extract query text');
      return;
    }

    // Categorize query
    const { category, complexity } = this.categorizeQuery(query);
    const tokenCount = this.countTokens(query);

    // Store query data for later optimization analysis
    const model = data.model || 'unknown';
    this.queryData.set(event.id, { category, complexity, tokenCount, model });

    // Save to database
    const queryRecord: QueryRecord = {
      id: event.id,
      sessionId: metadata.sessionId,
      timestamp: event.timestamp,
      query,
      model: data.model || 'unknown',
      category,
      complexity,
      tokenCount,
      metadata: {
        correlationId: metadata.correlationId,
        source: metadata.source
      }
    };

    try {
      await context.dataStore.saveQuery(queryRecord);
      context.logger.debug({ queryId: event.id, category, complexity }, 'Query saved');
    } catch (error) {
      context.logger.error({
        error: error instanceof Error ? error.message : String(error),
        eventId: event.id
      }, 'Failed to save query');
    }
  }

  private async handleResponseEvent(event: QueryEvent, context: PluginContext): Promise<void> {
    const { data, metadata } = event;
    const queryId = metadata.queryId || '';

    // Extract response text
    let responseText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason = '';
    let errorMessage = '';

    if (data.error) {
      errorMessage = `${data.error.type}: ${data.error.message}`;
    } else {
      // Extract response content
      if (data.content && Array.isArray(data.content)) {
        responseText = data.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
      }

      // Extract token usage
      if (data.usage) {
        inputTokens = data.usage.input_tokens || 0;
        outputTokens = data.usage.output_tokens || 0;
      }

      finishReason = data.stop_reason || '';
    }

    // Create response record
    const responseRecord: ResponseRecord = {
      id: event.id,
      queryId,
      sessionId: metadata.sessionId,
      timestamp: event.timestamp,
      response: responseText,
      model: data.model || 'unknown',
      inputTokens,
      outputTokens,
      latencyMs: metadata.latencyMs,
      finishReason
    };

    // Only add error field if there's an actual error
    if (errorMessage) {
      responseRecord.error = errorMessage;
    }

    try {
      await context.dataStore.saveResponse(responseRecord);
      context.logger.debug({ responseId: event.id, queryId }, 'Response saved');

      // Check for optimization opportunities
      if (!errorMessage && queryId) {
        const queryInfo = this.queryData.get(queryId);
        if (queryInfo) {
          const optimization = this.suggestOptimization(
            queryInfo,
            { model: queryInfo.model, inputTokens, outputTokens }
          );

          if (optimization) {
            await context.dataStore.saveOptimization({
              queryId,
              ...optimization
            });
            context.logger.info({ queryId, optimization }, 'Optimization suggestion saved');
          }
        }
      }
    } catch (error) {
      context.logger.error({
        error: error instanceof Error ? error.message : String(error),
        eventId: event.id
      }, 'Failed to save response');
    }
  }

  private async handleErrorEvent(event: QueryEvent, context: PluginContext): Promise<void> {
    // Error events are handled in handleResponseEvent
    await this.handleResponseEvent(event, context);
  }

  private categorizeQuery(query: string): CategoryResult {
    const normalizedQuery = query.toLowerCase().trim();

    // Check cache first
    const cached = this.cache.get(normalizedQuery);
    if (cached) {
      return cached;
    }

    let category = 'general';
    const matchedPatterns: { category: string; priority: number; matchPosition: number }[] = [];

    // Check custom patterns first if available
    if (this.customPatterns) {
      for (const pattern of this.customPatterns) {
        for (const keyword of pattern.patterns) {
          const keywordLower = keyword.toLowerCase();
          const position = normalizedQuery.indexOf(keywordLower);
          if (position !== -1) {
            matchedPatterns.push({
              category: pattern.category,
              priority: pattern.priority,
              matchPosition: position
            });
            break;
          }
        }
      }
    }

    // Check default patterns
    for (const [cat, keywords] of this.patterns) {
      for (const keyword of keywords) {
        const position = normalizedQuery.indexOf(keyword);
        if (position !== -1) {
          // Special handling for refactor - if it starts with "refactor", give it higher priority
          let priority = 100;
          if (cat === 'refactor' && normalizedQuery.startsWith('refactor')) {
            priority = 80;
          } else if (cat === 'test') {
            priority = 95;
          } else if (cat === 'debug' || cat === 'explanation') {
            priority = 90;
          }

          matchedPatterns.push({ category: cat, priority, matchPosition: position });
          break;
        }
      }
    }

    // Select category - prioritize by position and priority
    if (matchedPatterns.length > 0) {
      // Sort by priority first, then by match position (earlier matches preferred)
      matchedPatterns.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.matchPosition - b.matchPosition;
      });
      category = matchedPatterns[0].category;
    }

    const complexity = this.calculateComplexity(query);
    const result = { category, complexity };

    // Cache the result
    this.cache.set(normalizedQuery, result);

    return result;
  }

  private calculateComplexity(query: string): 'low' | 'medium' | 'high' {
    const wordCount = query.split(/\s+/).length;
    const hasMultipleClauses = /\band\b|\bwith\b|\bincluding\b|\balso\b/i.test(query);
    const hasComplexRequirements = /comprehensive|detailed|full|complete|extensive/i.test(query);
    const hasComplexProgramming = /algorithm|async.*await|explain how.*works/i.test(query);
    const hasKnownAlgorithms = /fibonacci|factorial|prime|recursion|sorting algorithm|binary search/i.test(query);
    const isSimpleRequest = /^(write|create|make)\s+(a\s+)?(simple\s+)?function/i.test(query);

    // High complexity
    if (wordCount > 15 || hasComplexRequirements || hasMultipleClauses) {
      return 'high';
    }

    // Medium complexity - complex programming concepts, algorithms, or longer explanations
    if (hasComplexProgramming || hasKnownAlgorithms || (query.includes('explain how') && wordCount > 5)) {
      return 'medium';
    }

    // Simple function requests remain low complexity
    if (isSimpleRequest || wordCount < 10) {
      return 'low';
    }

    return 'medium';
  }

  private countTokens(text: string): number {
    // Simple approximation: 1 token ≈ 4 characters or 1 word
    const words = text.split(/\s+/).length;
    return words;
  }

  private suggestOptimization(
    queryInfo: { category: string; complexity: string; tokenCount: number },
    responseInfo: { model: string; inputTokens: number; outputTokens: number }
  ): Omit<OptimizationSuggestion, 'queryId'> | null {
    // Only suggest optimization for simple queries using expensive models
    if (
      queryInfo.complexity === 'low' &&
      queryInfo.tokenCount < 50 &&
      responseInfo.model === 'claude-3-opus' &&
      responseInfo.outputTokens < 100
    ) {
      // Estimate cost savings (simplified)
      const opusCost = (responseInfo.inputTokens + responseInfo.outputTokens) * 0.000015;
      const haikuCost = (responseInfo.inputTokens + responseInfo.outputTokens) * 0.0000025;
      const estimatedSavings = opusCost - haikuCost;

      return {
        suggestion: 'Consider using claude-3-haiku for simple queries',
        alternativeModel: 'claude-3-haiku',
        estimatedSavings,
        confidence: 'high'
      };
    }

    return null;
  }
}