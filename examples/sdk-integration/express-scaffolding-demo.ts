#!/usr/bin/env tsx

/**
 * Express Service Scaffolding Demo
 * 
 * This example demonstrates how to use the Claude Code SDK with Claudeware
 * to scaffold a complete Express.js service with modern best practices.
 * 
 * Features demonstrated:
 * - Project structure creation
 * - Express service setup with TypeScript
 * - Database integration (SQLite)
 * - Authentication middleware
 * - API endpoints with validation
 * - Testing setup
 * - Docker configuration
 * - Claudeware analytics integration
 */

import { claude } from '@instantlyeasy/claude-code-sdk-ts';
import { ClaudeWrapper } from '../../src/wrapper';
// import path from 'path';
import fs from 'fs/promises';

interface ProjectConfig {
  name: string;
  description: string;
  port: number;
  database: 'sqlite' | 'postgres' | 'mysql';
  authentication: boolean;
  cors: boolean;
  rateLimit: boolean;
  testing: boolean;
  docker: boolean;
}

interface ScaffoldingAnalytics {
  filesCreated: string[];
  totalFiles: number;
  linesOfCode: number;
  dependencies: string[];
  estimatedTokens: number;
  scaffoldingTime: number;
}

class ExpressScaffolder {
  private claudewareWrapper: ClaudeWrapper;
  private analytics: ScaffoldingAnalytics;
  private startTime: number;

  constructor() {
    // Initialize Claudeware for analytics
    this.claudewareWrapper = new ClaudeWrapper({
      mode: 'development',
      claudePath: 'claude',
      database: {
        type: 'sqlite',
        path: './express-scaffolding.db',
        batchSize: 50,
        flushInterval: 1000,
        walMode: true
      },
      plugins: {
        enabled: ['query-collector'],
        disabled: []
      },
      monitoring: {
        enabled: true,
        logLevel: 'info'
      }
    });

    this.analytics = {
      filesCreated: [],
      totalFiles: 0,
      linesOfCode: 0,
      dependencies: [],
      estimatedTokens: 0,
      scaffoldingTime: 0
    };
    
    this.startTime = Date.now();
  }

  /**
   * Main scaffolding function
   */
  async scaffoldProject(config: ProjectConfig): Promise<void> {
    console.log(`🚀 Starting Express service scaffolding: ${config.name}`);
    console.log(`📊 Claudeware analytics enabled`);
    
    try {
      // Initialize Claudeware
      // Note: ClaudeWrapper doesn't have initialize method - it's ready to use

      // Create project structure
      await this.createProjectStructure(config);
      
      // Generate core files
      await this.generatePackageJson(config);
      await this.generateTsConfig(config);
      await this.generateServerFile(config);
      await this.generateRoutes(config);
      await this.generateMiddleware(config);
      await this.generateModels(config);
      
      // Optional features
      if (config.authentication) {
        await this.generateAuth(config);
      }
      
      if (config.testing) {
        await this.generateTests(config);
      }
      
      if (config.docker) {
        await this.generateDocker(config);
      }
      
      // Generate documentation
      await this.generateReadme(config);
      await this.generateApiDocs(config);
      
      // Final analytics
      this.analytics.scaffoldingTime = Date.now() - this.startTime;
      await this.generateAnalyticsReport();
      
      console.log(`✅ Project scaffolding complete!`);
      console.log(`📁 Files created: ${this.analytics.totalFiles}`);
      console.log(`⏱️  Time taken: ${this.analytics.scaffoldingTime}ms`);
      
    } catch (error) {
      console.error('❌ Scaffolding failed:', error);
      throw error;
    } finally {
      await this.claudewareWrapper.shutdown();
    }
  }

  /**
   * Create the basic project directory structure
   */
  private async createProjectStructure(config: ProjectConfig): Promise<void> {
    const dirs = [
      config.name,
      `${config.name}/src`,
      `${config.name}/src/controllers`,
      `${config.name}/src/middleware`,
      `${config.name}/src/models`,
      `${config.name}/src/routes`,
      `${config.name}/src/utils`,
      `${config.name}/src/types`,
      `${config.name}/tests`,
      `${config.name}/docs`
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    console.log(`📁 Created project structure: ${dirs.length} directories`);
  }

  /**
   * Generate package.json with dependencies
   */
  private async generatePackageJson(config: ProjectConfig): Promise<void> {
    const result = await claude()
      .withModel('sonnet')
      .allowTools('Write')
      .withTimeout(30000)
      .onToolUse(tool => {
        console.log(`🔧 SDK Tool used: ${tool.name}`);
        this.analytics.estimatedTokens += 100; // Rough estimate
      })
      .onMessage(msg => {
        if (msg.type === 'assistant') {
          // Track response for analytics
          const content = msg.content.map(block => 
            block.type === 'text' ? block.text : ''
          ).join('');
          this.analytics.estimatedTokens += content.split(' ').length;
        }
      })
      .query(`
Create a comprehensive package.json for an Express.js service with these requirements:

Project Details:
- Name: ${config.name}
- Description: ${config.description}
- Port: ${config.port}
- Database: ${config.database}
- Authentication: ${config.authentication ? 'enabled' : 'disabled'}
- CORS: ${config.cors ? 'enabled' : 'disabled'}
- Rate Limiting: ${config.rateLimit ? 'enabled' : 'disabled'}
- Testing: ${config.testing ? 'enabled (Jest + Supertest)' : 'disabled'}
- Docker: ${config.docker ? 'enabled' : 'disabled'}

Include:
- TypeScript configuration
- Development and production scripts
- Modern Express dependencies
- Security middleware
- Validation libraries
- Logging setup
- Environment configuration
- Appropriate dev dependencies

File path: ${config.name}/package.json
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/package.json`);
  }

  /**
   * Generate TypeScript configuration
   */
  private async generateTsConfig(config: ProjectConfig): Promise<void> {
    const result = await claude()
      .withModel('sonnet')
      .allowTools('Write')
      .onToolUse(tool => this.trackToolUsage(tool))
      .query(`
Create a modern tsconfig.json for the Express service.

Requirements:
- Target ES2022
- Strict mode enabled
- Path mapping for clean imports
- Output to dist/ directory
- Include source maps
- Proper module resolution
- Compatible with Node.js and Express

File path: ${config.name}/tsconfig.json
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/tsconfig.json`);
  }

  /**
   * Generate the main server file
   */
  private async generateServerFile(config: ProjectConfig): Promise<void> {
    const features: string[] = [];
    if (config.cors) features.push('CORS');
    if (config.rateLimit) features.push('Rate Limiting');
    if (config.authentication) features.push('Authentication');

    const result = await claude()
      .withModel('opus')
      .allowTools('Write')
      .withTimeout(45000)
      .onToolUse(tool => this.trackToolUsage(tool))
      .query(`
Create a production-ready Express server file with the following specifications:

Configuration:
- Port: ${config.port}
- Database: ${config.database}
- Features: ${features.join(', ') || 'Basic setup'}

Requirements:
1. TypeScript with proper typing
2. Environment variable configuration
3. Middleware setup (helmet, compression, morgan logging)
4. Error handling middleware
5. Health check endpoint
6. Graceful shutdown handling
7. Database connection setup
8. Route registration
9. Request validation setup
10. Security best practices

${config.cors ? '- Enable CORS with proper configuration' : ''}
${config.rateLimit ? '- Add rate limiting middleware' : ''}
${config.authentication ? '- JWT authentication setup' : ''}

File path: ${config.name}/src/server.ts

Also create the main app entry point at ${config.name}/src/app.ts
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/src/server.ts`);
    this.trackFileCreation(`${config.name}/src/app.ts`);
  }

  /**
   * Generate API routes
   */
  private async generateRoutes(config: ProjectConfig): Promise<void> {
    const result = await claude()
      .withModel('sonnet')
      .allowTools('Write', 'MultiEdit')
      .onToolUse(tool => this.trackToolUsage(tool))
      .query(`
Create a comprehensive REST API structure for ${config.name} with the following routes:

1. Health routes (GET /health, GET /health/db)
2. User routes (CRUD operations)
3. Authentication routes (if enabled: ${config.authentication})
4. API versioning (v1)

Requirements:
- TypeScript interfaces for all request/response types
- Input validation using Joi or Zod
- Proper HTTP status codes
- Error handling
- Request/response logging
- OpenAPI/Swagger documentation comments

Create these files:
- ${config.name}/src/routes/index.ts (main router)
- ${config.name}/src/routes/health.ts
- ${config.name}/src/routes/users.ts
${config.authentication ? `- ${config.name}/src/routes/auth.ts` : ''}
- ${config.name}/src/types/api.ts (TypeScript interfaces)

Database: ${config.database}
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/src/routes/index.ts`);
    this.trackFileCreation(`${config.name}/src/routes/health.ts`);
    this.trackFileCreation(`${config.name}/src/routes/users.ts`);
    this.trackFileCreation(`${config.name}/src/types/api.ts`);
    
    if (config.authentication) {
      this.trackFileCreation(`${config.name}/src/routes/auth.ts`);
    }
  }

  /**
   * Generate middleware
   */
  private async generateMiddleware(config: ProjectConfig): Promise<void> {
    const middlewareFeatures: string[] = [];
    if (config.authentication) middlewareFeatures.push('JWT Authentication');
    if (config.rateLimit) middlewareFeatures.push('Rate Limiting');
    middlewareFeatures.push('Error Handling', 'Request Validation', 'Logging');

    const result = await claude()
      .withModel('sonnet')
      .allowTools('Write', 'MultiEdit')
      .onToolUse(tool => this.trackToolUsage(tool))
      .query(`
Create a comprehensive middleware system for ${config.name} including:

Features to implement:
${middlewareFeatures.map(f => `- ${f}`).join('\n')}

Create these middleware files:
- ${config.name}/src/middleware/index.ts (exports all middleware)
- ${config.name}/src/middleware/error.ts (error handling)
- ${config.name}/src/middleware/validation.ts (request validation)
- ${config.name}/src/middleware/logging.ts (request/response logging)
${config.authentication ? `- ${config.name}/src/middleware/auth.ts (JWT authentication)` : ''}
${config.rateLimit ? `- ${config.name}/src/middleware/rateLimit.ts (rate limiting)` : ''}

Requirements:
- TypeScript with proper typing
- Async error handling
- Structured logging with correlation IDs
- Request/response sanitization
- Security headers
- Input validation with detailed error messages
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/src/middleware/index.ts`);
    this.trackFileCreation(`${config.name}/src/middleware/error.ts`);
    this.trackFileCreation(`${config.name}/src/middleware/validation.ts`);
    this.trackFileCreation(`${config.name}/src/middleware/logging.ts`);
    
    if (config.authentication) {
      this.trackFileCreation(`${config.name}/src/middleware/auth.ts`);
    }
    if (config.rateLimit) {
      this.trackFileCreation(`${config.name}/src/middleware/rateLimit.ts`);
    }
  }

  /**
   * Generate data models
   */
  private async generateModels(config: ProjectConfig): Promise<void> {
    const result = await claude()
      .withModel('sonnet')
      .allowTools('Write', 'MultiEdit')
      .onToolUse(tool => this.trackToolUsage(tool))
      .query(`
Create data models and database setup for ${config.name} using ${config.database}.

Create these files:
- ${config.name}/src/models/index.ts (database connection and exports)
- ${config.name}/src/models/User.ts (User model with validation)
- ${config.name}/src/models/BaseModel.ts (abstract base model)
- ${config.name}/src/utils/database.ts (database utilities)

Requirements:
- TypeScript interfaces and classes
- ${config.database} integration with proper connection pooling
- Model validation
- CRUD operations
- Migration support
- Seed data functionality
- Connection health checks
- Proper error handling
- Audit fields (createdAt, updatedAt)

${config.authentication ? 'Include password hashing and JWT token methods for User model' : ''}
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/src/models/index.ts`);
    this.trackFileCreation(`${config.name}/src/models/User.ts`);
    this.trackFileCreation(`${config.name}/src/models/BaseModel.ts`);
    this.trackFileCreation(`${config.name}/src/utils/database.ts`);
  }

  /**
   * Generate authentication system (if enabled)
   */
  private async generateAuth(config: ProjectConfig): Promise<void> {
    const result = await claude()
      .withModel('sonnet')
      .allowTools('Write', 'MultiEdit')
      .onToolUse(tool => this.trackToolUsage(tool))
      .query(`
Create a complete JWT authentication system for ${config.name}.

Create these files:
- ${config.name}/src/controllers/auth.ts (auth controller)
- ${config.name}/src/utils/jwt.ts (JWT utilities)
- ${config.name}/src/utils/password.ts (password hashing)
- ${config.name}/src/types/auth.ts (auth TypeScript interfaces)

Features:
- User registration with email verification
- Login/logout with JWT tokens
- Token refresh mechanism
- Password reset functionality
- Rate limiting for auth endpoints
- Input validation and sanitization
- Secure password requirements
- Account lockout after failed attempts
- Audit logging for security events

Security Requirements:
- bcrypt for password hashing
- JWT with proper expiration
- Secure HTTP headers
- Input sanitization
- SQL injection prevention
- Rate limiting
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/src/controllers/auth.ts`);
    this.trackFileCreation(`${config.name}/src/utils/jwt.ts`);
    this.trackFileCreation(`${config.name}/src/utils/password.ts`);
    this.trackFileCreation(`${config.name}/src/types/auth.ts`);
  }

  /**
   * Generate test suite (if enabled)
   */
  private async generateTests(config: ProjectConfig): Promise<void> {
    const result = await claude()
      .withModel('sonnet')
      .allowTools('Write', 'MultiEdit')
      .onToolUse(tool => this.trackToolUsage(tool))
      .query(`
Create a comprehensive test suite for ${config.name} using Jest and Supertest.

Create these test files:
- ${config.name}/tests/setup.ts (test configuration)
- ${config.name}/tests/health.test.ts (health endpoint tests)
- ${config.name}/tests/users.test.ts (user CRUD tests)
${config.authentication ? `- ${config.name}/tests/auth.test.ts (authentication tests)` : ''}
- ${config.name}/tests/middleware.test.ts (middleware tests)
- ${config.name}/tests/utils/testHelpers.ts (test utilities)
- ${config.name}/jest.config.js (Jest configuration)

Test Coverage:
- Unit tests for models and utilities
- Integration tests for API endpoints
- Middleware testing
- Error handling scenarios
- Database operations
${config.authentication ? '- Authentication flow testing' : ''}
- Input validation testing
- Performance testing basics

Requirements:
- TypeScript support
- Test database setup/teardown
- Mock data generators
- API response validation
- Coverage reporting
- Parallel test execution
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/tests/setup.ts`);
    this.trackFileCreation(`${config.name}/tests/health.test.ts`);
    this.trackFileCreation(`${config.name}/tests/users.test.ts`);
    this.trackFileCreation(`${config.name}/tests/middleware.test.ts`);
    this.trackFileCreation(`${config.name}/tests/utils/testHelpers.ts`);
    this.trackFileCreation(`${config.name}/jest.config.js`);
    
    if (config.authentication) {
      this.trackFileCreation(`${config.name}/tests/auth.test.ts`);
    }
  }

  /**
   * Generate Docker configuration (if enabled)
   */
  private async generateDocker(config: ProjectConfig): Promise<void> {
    const result = await claude()
      .withModel('opus')
      .allowTools('Write')
      .onToolUse(tool => this.trackToolUsage(tool))
      .query(`
Create Docker configuration for ${config.name} with multi-stage builds.

Create these files:
- ${config.name}/Dockerfile (multi-stage production build)
- ${config.name}/docker-compose.yml (development environment)
- ${config.name}/docker-compose.prod.yml (production environment)
- ${config.name}/.dockerignore (ignore unnecessary files)

Requirements:
- Node.js Alpine-based images for smaller size
- Multi-stage build (build -> production)
- ${config.database} service in docker-compose
- Environment variable configuration
- Health checks
- Volume mounting for development
- Production optimizations
- Security best practices
- Non-root user execution
- Proper layer caching
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/Dockerfile`);
    this.trackFileCreation(`${config.name}/docker-compose.yml`);
    this.trackFileCreation(`${config.name}/docker-compose.prod.yml`);
    this.trackFileCreation(`${config.name}/.dockerignore`);
  }

  /**
   * Generate project documentation
   */
  private async generateReadme(config: ProjectConfig): Promise<void> {
    const result = await claude()
      .withModel('sonnet')
      .allowTools('Write')
      .onToolUse(tool => this.trackToolUsage(tool))
      .query(`
Create a comprehensive README.md for ${config.name}.

Project Configuration:
- Description: ${config.description}
- Port: ${config.port}
- Database: ${config.database}
- Authentication: ${config.authentication ? 'Enabled (JWT)' : 'Disabled'}
- Testing: ${config.testing ? 'Enabled (Jest)' : 'Disabled'}
- Docker: ${config.docker ? 'Enabled' : 'Disabled'}

Include sections:
1. Project Overview
2. Features
3. Technology Stack
4. Prerequisites
5. Installation & Setup
6. Configuration
7. Running the Application
8. API Documentation
9. Testing
10. Docker Usage (if enabled)
11. Deployment
12. Contributing
13. License

Make it professional, clear, and actionable.

File path: ${config.name}/README.md
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/README.md`);
  }

  /**
   * Generate API documentation
   */
  private async generateApiDocs(config: ProjectConfig): Promise<void> {
    const result = await claude()
      .withModel('sonnet')
      .allowTools('Write')
      .onToolUse(tool => this.trackToolUsage(tool))
      .query(`
Create API documentation for ${config.name}.

Create these files:
- ${config.name}/docs/API.md (comprehensive API documentation)
- ${config.name}/docs/DEPLOYMENT.md (deployment guide)
- ${config.name}/docs/DEVELOPMENT.md (development setup)

API Documentation should include:
- Authentication (if enabled: ${config.authentication})
- All endpoints with examples
- Request/response schemas
- Error codes and messages
- Rate limiting information
- Usage examples with curl
- Postman collection information

Make it developer-friendly with clear examples.
      `);

    await result.asText();
    this.trackFileCreation(`${config.name}/docs/API.md`);
    this.trackFileCreation(`${config.name}/docs/DEPLOYMENT.md`);
    this.trackFileCreation(`${config.name}/docs/DEVELOPMENT.md`);
  }

  /**
   * Generate final analytics report
   */
  private async generateAnalyticsReport(): Promise<void> {
    const report = {
      projectName: 'Express Scaffolding',
      timestamp: new Date().toISOString(),
      scaffoldingTime: this.analytics.scaffoldingTime,
      performance: {
        totalFiles: this.analytics.totalFiles,
        estimatedTokens: this.analytics.estimatedTokens,
        averageTimePerFile: this.analytics.scaffoldingTime / this.analytics.totalFiles
      },
      filesCreated: this.analytics.filesCreated,
      claudewareIntegration: {
        analyticsEnabled: true,
        databasePath: './express-scaffolding.db',
        pluginsUsed: ['query-collector']
      }
    };

    await fs.writeFile(
      './express-scaffolding-analytics.json',
      JSON.stringify(report, null, 2)
    );

    console.log('\n📊 Scaffolding Analytics Report:');
    console.log(`   Files Created: ${report.performance.totalFiles}`);
    console.log(`   Estimated Tokens: ${report.performance.estimatedTokens}`);
    console.log(`   Average Time/File: ${Math.round(report.performance.averageTimePerFile)}ms`);
    console.log(`   Analytics saved to: express-scaffolding-analytics.json`);
  }

  /**
   * Track file creation for analytics
   */
  private trackFileCreation(filepath: string): void {
    this.analytics.filesCreated.push(filepath);
    this.analytics.totalFiles++;
    console.log(`✅ Created: ${filepath}`);
  }

  /**
   * Track tool usage for analytics
   */
  private trackToolUsage(tool: { name: string; input: Record<string, unknown> }): void {
    console.log(`🔧 Tool used: ${tool.name}`);
    this.analytics.estimatedTokens += 150; // Rough estimate for tool usage
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const projectConfig: ProjectConfig = {
    name: 'my-express-api',
    description: 'A modern Express.js REST API with TypeScript, authentication, and comprehensive testing',
    port: 3000,
    database: 'sqlite',
    authentication: true,
    cors: true,
    rateLimit: true,
    testing: true,
    docker: true
  };

  console.log('🏗️  Express Service Scaffolding with Claude Code SDK + Claudeware');
  console.log('================================================================\n');
  
  console.log('Project Configuration:');
  console.log(`  Name: ${projectConfig.name}`);
  console.log(`  Database: ${projectConfig.database}`);
  console.log(`  Authentication: ${projectConfig.authentication ? '✅' : '❌'}`);
  console.log(`  Testing: ${projectConfig.testing ? '✅' : '❌'}`);
  console.log(`  Docker: ${projectConfig.docker ? '✅' : '❌'}`);
  console.log('');

  const scaffolder = new ExpressScaffolder();
  
  try {
    await scaffolder.scaffoldProject(projectConfig);
    
    console.log('\n🎉 Project scaffolding completed successfully!');
    console.log('\nNext steps:');
    console.log(`  1. cd ${projectConfig.name}`);
    console.log('  2. npm install');
    console.log('  3. npm run dev');
    console.log('  4. Open http://localhost:3000/health');
    
  } catch (error) {
    console.error('\n❌ Scaffolding failed:', error);
    process.exit(1);
  }
}

// Run the demo
if (require.main === module) {
  main().catch(console.error);
}

export { ExpressScaffolder, ProjectConfig, ScaffoldingAnalytics };