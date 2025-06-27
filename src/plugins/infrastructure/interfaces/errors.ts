/**
 * Custom error types for plugin infrastructure
 */

/**
 * Error thrown when security constraints are violated
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Error thrown when database attach operations fail
 */
export class AttachError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AttachError';
    this.code = code;
  }
}

/**
 * Error thrown when query building fails
 */
export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

/**
 * Error thrown when contract operations fail
 */
export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

/**
 * Error thrown when permission validation fails
 */
export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}