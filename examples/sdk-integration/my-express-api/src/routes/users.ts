/**
 * @fileoverview User CRUD routes with validation
 * @swagger
 * tags:
 *   - name: Users
 *     description: User management endpoints
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import {
  User,
  UserResponse,
  UsersResponse,
  CreateUserRequest,
  UpdateUserRequest,
  UserQueryParams,
  ValidationErrorResponse,
  HttpStatus,
  AuthenticatedRequest
} from '../types/api';

const router = Router();

// Validation schemas
const createUserSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  username: Joi.string().alphanum().min(3).max(30).required().messages({
    'string.alphanum': 'Username must contain only letters and numbers',
    'string.min': 'Username must be at least 3 characters long',
    'string.max': 'Username must be no longer than 30 characters',
    'any.required': 'Username is required'
  }),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required().messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    'any.required': 'Password is required'
  }),
  firstName: Joi.string().max(50).optional(),
  lastName: Joi.string().max(50).optional()
});

const updateUserSchema = Joi.object({
  email: Joi.string().email().optional(),
  username: Joi.string().alphanum().min(3).max(30).optional(),
  firstName: Joi.string().max(50).optional(),
  lastName: Joi.string().max(50).optional(),
  isActive: Joi.boolean().optional()
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().valid('id', 'email', 'username', 'createdAt', 'updatedAt').default('id'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
  search: Joi.string().max(100).optional(),
  isActive: Joi.boolean().optional(),
  createdAfter: Joi.date().iso().optional(),
  createdBefore: Joi.date().iso().optional()
});

// Middleware for validation
const validateRequest = (schema: Joi.ObjectSchema, property: 'body' | 'query' = 'body') => {
  return (req: Request, res: Response, next: any) => {
    const { error, value } = schema.validate(req[property], { abortEarly: false });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      const response: ValidationErrorResponse = {
        success: false,
        message: 'Validation failed',
        errors: validationErrors,
        timestamp: new Date().toISOString()
      };

      return res.status(HttpStatus.UNPROCESSABLE_ENTITY).json(response);
    }

    req[property] = value;
    next();
  };
};

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users with pagination and filtering
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, email, username, createdAt, updatedAt]
 *           default: id
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           maxLength: 100
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 */
router.get('/', validateRequest(querySchema, 'query'), async (req: Request, res: Response) => {
  try {
    const queryParams: UserQueryParams = req.query;
    
    // TODO: Replace with actual database query
    // const users = await userService.findUsers(queryParams);
    // const total = await userService.countUsers(queryParams);
    
    // Mock data - replace with actual implementation
    const mockUsers: User[] = [
      {
        id: 1,
        email: 'john@example.com',
        username: 'johndoe',
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const response: UsersResponse = {
      success: true,
      data: mockUsers,
      pagination: {
        page: queryParams.page || 1,
        limit: queryParams.limit || 10,
        total: 1, // Replace with actual count
        pages: 1
      },
      timestamp: new Date().toISOString()
    };

    res.status(HttpStatus.OK).json(response);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to fetch users',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *       404:
 *         description: User not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Invalid user ID',
        timestamp: new Date().toISOString()
      });
    }

    // TODO: Replace with actual database query
    // const user = await userService.findById(userId);
    
    // Mock implementation
    const user: User | null = userId === 1 ? {
      id: 1,
      email: 'john@example.com',
      username: 'johndoe',
      firstName: 'John',
      lastName: 'Doe',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } : null;

    if (!user) {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: 'User not found',
        timestamp: new Date().toISOString()
      });
    }

    const response: UserResponse = {
      success: true,
      data: user,
      timestamp: new Date().toISOString()
    };

    res.status(HttpStatus.OK).json(response);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to fetch user',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - username
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 30
 *               password:
 *                 type: string
 *                 minLength: 8
 *               firstName:
 *                 type: string
 *                 maxLength: 50
 *               lastName:
 *                 type: string
 *                 maxLength: 50
 *     responses:
 *       201:
 *         description: User created successfully
 *       422:
 *         description: Validation error
 *       409:
 *         description: User already exists
 */
router.post('/', validateRequest(createUserSchema), async (req: Request, res: Response) => {
  try {
    const userData: CreateUserRequest = req.body;

    // TODO: Replace with actual database operations
    // Check if user already exists
    // const existingUser = await userService.findByEmailOrUsername(userData.email, userData.username);
    // if (existingUser) {
    //   return res.status(HttpStatus.CONFLICT).json({
    //     success: false,
    //     error: 'User with this email or username already exists',
    //     timestamp: new Date().toISOString()
    //   });
    // }

    // Hash password and create user
    // const hashedPassword = await bcrypt.hash(userData.password, 10);
    // const newUser = await userService.create({ ...userData, password: hashedPassword });

    // Mock implementation
    const newUser: User = {
      id: Date.now(), // Mock ID generation
      email: userData.email,
      username: userData.username,
      firstName: userData.firstName,
      lastName: userData.lastName,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const response: UserResponse = {
      success: true,
      data: newUser,
      message: 'User created successfully',
      timestamp: new Date().toISOString()
    };

    res.status(HttpStatus.CREATED).json(response);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to create user',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 30
 *               firstName:
 *                 type: string
 *                 maxLength: 50
 *               lastName:
 *                 type: string
 *                 maxLength: 50
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 *       422:
 *         description: Validation error
 */
router.put('/:id', validateRequest(updateUserSchema), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const updateData: UpdateUserRequest = req.body;

    if (isNaN(userId)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Invalid user ID',
        timestamp: new Date().toISOString()
      });
    }

    // TODO: Replace with actual database operations
    // const existingUser = await userService.findById(userId);
    // if (!existingUser) {
    //   return res.status(HttpStatus.NOT_FOUND).json({
    //     success: false,
    //     error: 'User not found',
    //     timestamp: new Date().toISOString()
    //   });
    // }

    // const updatedUser = await userService.update(userId, updateData);

    // Mock implementation
    const updatedUser: User = {
      id: userId,
      email: updateData.email || 'john@example.com',
      username: updateData.username || 'johndoe',
      firstName: updateData.firstName || 'John',
      lastName: updateData.lastName || 'Doe',
      isActive: updateData.isActive !== undefined ? updateData.isActive : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const response: UserResponse = {
      success: true,
      data: updatedUser,
      message: 'User updated successfully',
      timestamp: new Date().toISOString()
    };

    res.status(HttpStatus.OK).json(response);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to update user',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    if (isNaN(userId)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Invalid user ID',
        timestamp: new Date().toISOString()
      });
    }

    // TODO: Replace with actual database operations
    // const existingUser = await userService.findById(userId);
    // if (!existingUser) {
    //   return res.status(HttpStatus.NOT_FOUND).json({
    //     success: false,
    //     error: 'User not found',
    //     timestamp: new Date().toISOString()
    //   });
    // }

    // await userService.delete(userId);

    res.status(HttpStatus.NO_CONTENT).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to delete user',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;