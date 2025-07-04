/**
 * @fileoverview Main router with API versioning
 * @swagger
 * info:
 *   title: Express REST API
 *   version: 1.0.0
 *   description: A comprehensive REST API with authentication, user management, and health checks
 *   contact:
 *     name: API Support
 *     email: support@example.com
 *   license:
 *     name: MIT
 *     url: https://opensource.org/licenses/MIT
 * servers:
 *   - url: http://localhost:3000/api/v1
 *     description: Development server
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   responses:
 *     UnauthorizedError:
 *       description: Authentication information is missing or invalid
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "Authentication required"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *     ValidationError:
 *       description: Validation error
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Validation failed"
 *               errors:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     field:
 *                       type: string
 *                       example: "email"
 *                     message:
 *                       type: string
 *                       example: "Please provide a valid email address"
 *                     value:
 *                       type: string
 *                       example: "invalid-email"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *     NotFoundError:
 *       description: Resource not found
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "Resource not found"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *     InternalServerError:
 *       description: Internal server error
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               error:
 *                 type: string
 *                 example: "Internal server error"
 *               timestamp:
 *                 type: string
 *                 format: date-time
 */

import { Router, Request, Response } from 'express';
import healthRoutes from './health';
import userRoutes from './users';
import authRoutes from './auth';
import { HttpStatus } from '../types/api';

const router = Router();

// Request logging middleware
router.use((req: Request, res: Response, next) => {
  const start = Date.now();
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${req.ip}`);
  
  // Log response when it finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// API versioning - v1 routes
const v1Router = Router();

/**
 * @swagger
 * /:
 *   get:
 *     summary: API root endpoint
 *     tags: [General]
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "Express REST API"
 *                     version:
 *                       type: string
 *                       example: "1.0.0"
 *                     description:
 *                       type: string
 *                       example: "A comprehensive REST API with authentication, user management, and health checks"
 *                     endpoints:
 *                       type: object
 *                       properties:
 *                         health:
 *                           type: string
 *                           example: "/api/v1/health"
 *                         users:
 *                           type: string
 *                           example: "/api/v1/users"
 *                         auth:
 *                           type: string
 *                           example: "/api/v1/auth"
 *                         docs:
 *                           type: string
 *                           example: "/api/docs"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
v1Router.get('/', (req: Request, res: Response) => {
  res.status(HttpStatus.OK).json({
    success: true,
    data: {
      name: 'Express REST API',
      version: '1.0.0',
      description: 'A comprehensive REST API with authentication, user management, and health checks',
      endpoints: {
        health: '/api/v1/health',
        users: '/api/v1/users',
        auth: '/api/v1/auth',
        docs: '/api/docs'
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Mount route modules
v1Router.use('/health', healthRoutes);
v1Router.use('/users', userRoutes);
v1Router.use('/auth', authRoutes);

// Mount v1 routes
router.use('/v1', v1Router);

// Default route for root API path
router.get('/', (req: Request, res: Response) => {
  res.status(HttpStatus.OK).json({
    success: true,
    data: {
      name: 'Express REST API',
      version: '1.0.0',
      description: 'A comprehensive REST API with authentication, user management, and health checks',
      availableVersions: ['v1'],
      currentVersion: 'v1',
      endpoints: {
        v1: '/api/v1',
        docs: '/api/docs'
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Handle 404 for API routes
router.use('*', (req: Request, res: Response) => {
  res.status(HttpStatus.NOT_FOUND).json({
    success: false,
    error: `API endpoint '${req.originalUrl}' not found`,
    message: 'Please check the API documentation for available endpoints',
    availableVersions: ['v1'],
    docsUrl: '/api/docs',
    timestamp: new Date().toISOString()
  });
});

// Global error handler for API routes
router.use((error: Error, req: Request, res: Response, next: any) => {
  console.error(`[${new Date().toISOString()}] API Error:`, error);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    success: false,
    error: 'Internal server error',
    message: isDevelopment ? error.message : 'Something went wrong',
    ...(isDevelopment && { stack: error.stack }),
    timestamp: new Date().toISOString()
  });
});

export default router;