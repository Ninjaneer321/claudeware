/**
 * JSON Stream Parser for handling partial and malformed JSON data
 * Provides robust parsing with recovery strategies for streaming data
 */
export class JsonStreamParser {
  private buffer: string = '';
  private readonly maxBufferSize: number = 65536; // 64KB
  private lastChunkTime: number = Date.now();
  private readonly timeoutMs: number = 1000;

  /**
   * Parse a chunk of data that may contain zero or more JSON objects
   * Handles partial chunks by buffering incomplete data
   * 
   * @param chunk - Raw data chunk (string or Buffer)
   * @returns Array of parsed JSON objects (empty if none found)
   */
  parse(chunk: Buffer | string): any[] {
    const results: any[] = [];
    
    try {
      // Convert Buffer to string if needed
      const dataStr = typeof chunk === 'string' 
        ? chunk 
        : chunk.toString('utf8');
      
      // Handle empty input
      if (!dataStr || dataStr.trim().length === 0) {
        return results;
      }

      // Check for timeout on incomplete buffer
      const now = Date.now();
      const timeDiff = now - this.lastChunkTime;
      if (this.buffer.length > 0 && timeDiff >= this.timeoutMs) {
        this.buffer = '';
      }

      // Combine with existing buffer
      const combined = this.buffer + dataStr;
      
      // Update timestamp when adding to buffer
      if (dataStr.trim()) {
        this.lastChunkTime = Date.now();
      }

      // Enforce max buffer size
      if (combined.length > this.maxBufferSize) {
        this.buffer = combined.slice(-this.maxBufferSize);
      } else {
        this.buffer = combined;
      }

      // Try different parsing strategies
      const parsed = this.tryParsing(this.buffer);
      
      if (parsed.results.length > 0) {
        results.push(...parsed.results);
        this.buffer = parsed.remainder;
      }

      return results;
    } catch (error) {
      // Never throw - return empty array on any error
      return results;
    }
  }

  /**
   * Reset the parser state and clear the buffer
   */
  reset(): void {
    this.buffer = '';
    this.lastChunkTime = Date.now();
  }

  /**
   * Get the current buffer content for debugging
   * @returns Current buffer content
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Try multiple parsing strategies on the buffer
   * @param data - Data to parse
   * @returns Parsed results and remaining buffer
   */
  private tryParsing(data: string): { results: any[]; remainder: string } {
    const results: any[] = [];
    let remainder = data;

    // Strategy 1: Try to parse the complete buffer as JSON
    const completeResult = this.tryParseComplete(remainder);
    if (completeResult.parsed) {
      results.push(...completeResult.results);
      remainder = completeResult.remainder;
    } else {
      // Strategy 2: Try line-by-line parsing
      const lineResult = this.tryParseLines(remainder);
      results.push(...lineResult.results);
      remainder = lineResult.remainder;
    }

    return { results, remainder };
  }

  /**
   * Try to parse the complete buffer as a single JSON object
   * @param data - Data to parse
   * @returns Parse result
   */
  private tryParseComplete(data: string): { 
    parsed: boolean; 
    results: any[]; 
    remainder: string 
  } {
    try {
      // Trim whitespace
      const trimmed = data.trim();
      if (!trimmed) {
        return { parsed: false, results: [], remainder: data };
      }

      // Try to parse as complete JSON
      const parsed = JSON.parse(trimmed);
      return { parsed: true, results: [parsed], remainder: '' };
    } catch {
      return { parsed: false, results: [], remainder: data };
    }
  }

  /**
   * Try to parse line by line, handling partial lines
   * @param data - Data to parse
   * @returns Parse result
   */
  private tryParseLines(data: string): { results: any[]; remainder: string } {
    const results: any[] = [];
    const lines = data.split('\n');
    
    // Process all complete lines
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Try to parse the line
      const parsed = this.tryParseLine(line);
      if (parsed) {
        results.push(parsed);
      }
    }

    // Last line might be incomplete - keep it in buffer
    const lastLine = lines[lines.length - 1];
    
    // Try to parse the last line if it looks complete
    if (lastLine.trim()) {
      const parsed = this.tryParseLine(lastLine);
      if (parsed) {
        results.push(parsed);
        return { results, remainder: '' };
      }
    }

    return { results, remainder: lastLine };
  }

  /**
   * Try to parse a single line, handling SSE format
   * @param line - Line to parse
   * @returns Parsed object or null
   */
  private tryParseLine(line: string): any | null {
    if (!line) return null;

    try {
      // Handle SSE format (data: {...})
      if (line.startsWith('data: ')) {
        line = line.substring(6).trim();
      }

      // Try to parse as JSON
      return JSON.parse(line);
    } catch {
      // Try recovery strategies
      return this.tryRecovery(line);
    }
  }

  /**
   * Try recovery strategies for malformed JSON
   * @param data - Data to recover
   * @returns Recovered object or null
   */
  private tryRecovery(data: string): any | null {
    // Skip if it doesn't look like JSON
    if (!data.includes('{') && !data.includes('[')) {
      return null;
    }

    // Try to find and parse JSON-like content
    const jsonMatch = data.match(/(\{[^}]*\}|\[[^\]]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Recovery failed
      }
    }

    return null;
  }
}