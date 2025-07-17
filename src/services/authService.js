import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import database from '../config/database.js';
import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';

class AuthService {
  async register(userData) {
    const { username, email, password, firstName, lastName } = userData;
    
    try {
      // Check if user already exists
      const existingUser = await database.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('User already exists with this email or username');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const result = await database.query(`
        INSERT INTO users (username, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, username, email, first_name, last_name, created_at
      `, [username, email, passwordHash, firstName, lastName]);

      const user = result.rows[0];

      // Log activity
      await this.logActivity(user.id, 'user_registered', 'user', user.id);

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at
      };
    } catch (error) {
      logger.error('Registration error:', error);
      throw error;
    }
  }

  async login(email, password, ipAddress, userAgent) {
    try {
      // Get user with password hash
      const result = await database.query(
        'SELECT id, username, email, password_hash, first_name, last_name, is_active FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid credentials');
      }

      const user = result.rows[0];

      if (!user.is_active) {
        throw new Error('Account is deactivated');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Invalid credentials');
      }

      // Generate tokens
      const tokens = await this.generateTokens(user.id);

      // Update last login
      await database.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      // Log activity
      await this.logActivity(user.id, 'user_login', 'user', user.id, null, ipAddress, userAgent);

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name
        },
        tokens
      };
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  async refreshToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);

      // Check if refresh token exists and is not revoked
      const tokenResult = await database.query(
        'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP AND revoked_at IS NULL',
        [await bcrypt.hash(refreshToken, 1)]
      );

      if (tokenResult.rows.length === 0) {
        throw new Error('Invalid refresh token');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(decoded.userId);

      // Revoke old refresh token
      await database.query(
        'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1',
        [await bcrypt.hash(refreshToken, 1)]
      );

      return tokens;
    } catch (error) {
      logger.error('Token refresh error:', error);
      throw error;
    }
  }

  async logout(refreshToken, userId) {
    try {
      if (refreshToken) {
        // Revoke refresh token
        await database.query(
          'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1',
          [await bcrypt.hash(refreshToken, 1)]
        );
      }

      // Remove user from active sessions in Redis
      await redisClient.del(`user_session:${userId}`);

      // Log activity
      await this.logActivity(userId, 'user_logout', 'user', userId);

      return true;
    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }

  async generateTokens(userId) {
    try {
      // Generate access token
      const accessToken = jwt.sign(
        { userId, type: 'access' },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { userId, type: 'refresh', jti: uuidv4() },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiresIn }
      );

      // Store refresh token in database
      const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await database.query(`
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `, [userId, refreshTokenHash, expiresAt]);

      // Store session in Redis
      await redisClient.set(`user_session:${userId}`, {
        userId,
        loginTime: new Date().toISOString()
      }, 15 * 60); // 15 minutes

      return {
        accessToken,
        refreshToken,
        expiresIn: config.jwt.expiresIn
      };
    } catch (error) {
      logger.error('Token generation error:', error);
      throw error;
    }
  }

  async logActivity(userId, action, resourceType, resourceId, details = null, ipAddress = null, userAgent = null) {
    try {
      await database.query(`
        INSERT INTO activity_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [userId, action, resourceType, resourceId, details, ipAddress, userAgent]);
    } catch (error) {
      logger.error('Activity logging error:', error);
      // Don't throw error for logging failures
    }
  }

  async cleanupExpiredTokens() {
    try {
      const result = await database.query('SELECT cleanup_expired_tokens()');
      logger.info('Cleaned up expired tokens');
      return result;
    } catch (error) {
      logger.error('Token cleanup error:', error);
      throw error;
    }
  }
}

export default new AuthService();