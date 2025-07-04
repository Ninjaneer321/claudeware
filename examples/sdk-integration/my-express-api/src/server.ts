import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Database } from 'sqlite3';
import { open } from 'sqlite';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const DB_PATH = process.env.DB_PATH || './database.sqlite';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Create Express app
export const app: Express = express();

// Database setup
let db: Database;

export async function connectDatabase() {
  try {
    db = await open({
      filename: DB_PATH,
      driver: Database
    });
    
    // Initialize database schema
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
    
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (CORS_ORIGIN === '*') {
      callback(null, true);
    } else {
      const allowedOrigins = CORS_ORIGIN.split(',');
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware setup
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(cors(corsOptions)); // CORS
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Logging
if (NODE_ENV === 'production') {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Log to file in production
  const accessLogStream = fs.createWriteStream(
    path.join(logsDir, 'access.log'),
    { flags: 'a' }
  );
  app.use(morgan('combined', { stream: accessLogStream }));
} else {
  // Log to console in development
  app.use(morgan('dev'));
}

// Apply rate limiting to all routes
app.use('/api/', limiter);

// Authentication middleware
export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Check if token exists in database and is not expired
    const session = await db.get(
      'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")',
      [token]
    );
    
    if (!session) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    req.user = {
      id: decoded.userId,
      email: decoded.email
    };
    
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Request validation middleware
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
  });
});

// Authentication routes
app.post('/api/auth/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
  ],
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      
      // In production, you should hash the password using bcrypt
      // const hashedPassword = await bcrypt.hash(password, 10);
      
      // For demo purposes, storing plain text (DO NOT DO THIS IN PRODUCTION)
      await db.run(
        'INSERT INTO users (email, password) VALUES (?, ?)',
        [email, password]
      );
      
      res.status(201).json({ message: 'User created successfully' });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      next(error);
    }
  }
);

app.post('/api/auth/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      
      const user = await db.get(
        'SELECT * FROM users WHERE email = ? AND password = ?',
        [email, password]
      );
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      // Store session in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);
      
      await db.run(
        'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, token, expiresAt.toISOString()]
      );
      
      res.json({ token, expiresIn: '24h' });
    } catch (error) {
      next(error);
    }
  }
);

// Protected route example
app.get('/api/protected', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({
    message: 'This is a protected route',
    user: req.user
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  
  // Don't leak error details in production
  const message = NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(500).json({
    error: message,
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
let server: any;

export async function startServer() {
  try {
    await connectDatabase();
    
    server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
    });
    
    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`${signal} received, starting graceful shutdown...`);
      
      server.close(() => {
        console.log('HTTP server closed');
      });
      
      // Close database connection
      if (db) {
        await db.close();
        console.log('Database connection closed');
      }
      
      process.exit(0);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

export default app;