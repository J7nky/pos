import express from 'express';
import authController from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate, schemas } from '../utils/validation.js';

const router = express.Router();

// Public routes
router.post('/register', 
  authLimiter,
  validate(schemas.register),
  authController.register
);

router.post('/login',
  authLimiter,
  validate(schemas.login),
  authController.login
);

router.post('/refresh-token',
  validate(schemas.refreshToken),
  authController.refreshToken
);

// Protected routes
router.post('/logout',
  authenticateToken,
  authController.logout
);

router.get('/profile',
  authenticateToken,
  authController.getProfile
);

export default router;