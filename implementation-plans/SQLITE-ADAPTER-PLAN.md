# SQLite Adapter Implementation Plan

## Component Overview
A database adapter implementing the DataStore interface for SQLite, with support for batching, WAL mode, and comprehensive query analytics.

## Key Requirements
- Implement DataStore interface completely
- Use better-sqlite3 for synchronous operations
- Enable WAL mode for concurrent access
- Support batch operations in transactions
- Provide query statistics and analytics
- Handle JSON metadata serialization

## Implementation Details

### Database Schema
```sql
-- Queries table
CREATE TABLE queries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  query TEXT NOT NULL,
  model TEXT,
  category TEXT,
  complexity TEXT,
  token_count INTEGER,
  metadata TEXT -- JSON
);

-- Responses table
CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  query_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  response TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  finish_reason TEXT,
  error TEXT,
  FOREIGN KEY (query_id) REFERENCES queries(id)
);

-- Optimizations table
CREATE TABLE optimizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_id TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  alternative_model TEXT,
  estimated_savings REAL,
  confidence TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (query_id) REFERENCES queries(id)
);

-- Indices for performance
CREATE INDEX idx_session_id ON queries(session_id);
CREATE INDEX idx_timestamp ON queries(timestamp);
CREATE INDEX idx_category ON queries(category);
CREATE INDEX idx_resp_query_id ON responses(query_id);
```

### Core Features
1. **Connection Management**
   - Single connection with prepared statements
   - WAL mode: `PRAGMA journal_mode = WAL`
   - Busy timeout: `PRAGMA busy_timeout = 5000`
   - Foreign keys: `PRAGMA foreign_keys = ON`

2. **CRUD Operations**
   - saveQuery with metadata JSON serialization
   - saveResponse with error handling
   - saveOptimization for suggestions
   - Batch operations in transactions

3. **Query Operations**
   - getQuery by ID
   - getResponse by query ID
   - getSessionQueries with ordering
   - Complex analytics queries

4. **Analytics**
   - Total queries/tokens
   - Average latency
   - Category distribution
   - Model usage stats
   - Error rates

### API Implementation
```typescript
class SqliteAdapter implements DataStore {
  private db: Database.Database;
  private statements: PreparedStatements;
  
  async init(): Promise<void>;
  async close(): Promise<void>;
  
  // Core operations
  async saveQuery(query: QueryRecord): Promise<void>;
  async saveResponse(response: ResponseRecord): Promise<void>;
  async saveOptimization(opt: OptimizationSuggestion): Promise<void>;
  
  // Batch operations
  async batchSave(records: Array<QueryRecord | ResponseRecord>): Promise<void>;
  
  // Query operations
  async getQuery(id: string): Promise<QueryRecord | null>;
  async getResponse(queryId: string): Promise<ResponseRecord | null>;
  async getSessionQueries(sessionId: string): Promise<QueryRecord[]>;
  
  // Analytics
  async getQueryStats(timeRange?: DateRange): Promise<QueryStats>;
}
```

### Error Handling
- Wrap all operations in try-catch
- Convert SQLite errors to DataStore errors
- Handle JSON parse errors gracefully
- Log but don't throw on close errors

### Performance Optimizations
- Prepared statements for all queries
- Batch inserts in single transaction
- Efficient indexing strategy
- Connection reuse

## Test Coverage (55 cases)
- Database initialization and schema creation
- CRUD operations with various data
- Batch operations and transactions
- Error handling scenarios
- JSON metadata handling
- Analytics queries
- Date range filtering
- Connection cleanup

## Success Criteria
- All 55 test cases pass
- Handle 1000+ records/second
- Sub-millisecond query performance
- Proper transaction isolation
- Accurate analytics