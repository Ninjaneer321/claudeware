/**
 * @fileoverview Health check routes
 * @swagger
 * tags:
 *   - name: Health
 *     description: Health check endpoints
 */

import { Router, Request, Response } from 'express';
import { HealthResponse, DatabaseHealthResponse, HttpStatus } from '../types/api';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
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
 *                     status:
 *                       type: string
 *                       example: "healthy"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: number
 *                       example: 3600
 *                     version:
 *                       type: string
 *                       example: "1.0.0"
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const healthData: HealthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    };

    res.status(HttpStatus.OK).json({
      success: true,
      data: healthData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      success: false,
      error: 'Service unhealthy',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /health/db:
 *   get:
 *     summary: Database health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Database is healthy
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
 *                     status:
 *                       type: string
 *                       example: "healthy"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: number
 *                       example: 3600
 *                     version:
 *                       type: string
 *                       example: "1.0.0"
 *                     database:
 *                       type: object
 *                       properties:
 *                         connected:
 *                           type: boolean
 *                           example: true
 *                         latency:
 *                           type: number
 *                           example: 5
 *       503:
 *         description: Database is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Database connection failed"
 */
router.get('/db', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    
    // TODO: Replace with actual database connection check
    // For SQLite, you might want to do a simple query like SELECT 1
    // const db = getDatabase();
    // await db.get('SELECT 1');
    
    // Simulated database check - replace with actual implementation
    const dbConnected = true; // Replace with actual DB check
    const latency = Date.now() - startTime;

    const healthData: DatabaseHealthResponse = {
      status: dbConnected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      database: {
        connected: dbConnected,
        latency: dbConnected ? latency : undefined,
        error: dbConnected ? undefined : 'Database connection failed'
      }
    };

    const statusCode = dbConnected ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    
    res.status(statusCode).json({
      success: dbConnected,
      data: healthData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    
    const healthData: DatabaseHealthResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown database error'
      }
    };

    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      success: false,
      data: healthData,
      error: 'Database health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;