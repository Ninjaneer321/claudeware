/**
 * @fileoverview API type definitions for request/response types
 */

import { Request, Response } from 'express';

// Base response interface
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

// Pagination interface
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Health check interfaces
export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
}

export interface DatabaseHealthResponse extends HealthResponse {
  database: {
    connected: boolean;
    latency?: number;
    error?: string;
  };
}

// User interfaces
export interface User {
  id: number;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface UpdateUserRequest {
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}

export interface UserResponse extends ApiResponse<User> {}
export interface UsersResponse extends PaginatedResponse<User> {}

// Authentication interfaces
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends CreateUserRequest {
  confirmPassword: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse extends ApiResponse<AuthTokens> {
  user: Omit<User, 'password'>;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// Custom request interfaces with user context
export interface AuthenticatedRequest extends Request {
  user?: User;
}

// Validation error interface
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationErrorResponse extends ApiResponse {
  errors: ValidationError[];
}

// Query parameters for user listing
export interface UserQueryParams extends PaginationParams {
  search?: string;
  isActive?: boolean;
  createdAfter?: string;
  createdBefore?: string;
}

// Common HTTP status codes
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503
}

// Express middleware types
export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: any
) => Promise<void | Response>;

export type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: any
) => Promise<void | Response>;