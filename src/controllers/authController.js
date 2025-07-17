import authService from '../services/authService.js';
import logger from '../utils/logger.js';

class AuthController {
  async register(req, res) {
    try {
      const user = await authService.register(req.body);
      
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: { user }
      });
    } catch (error) {
      logger.error('Registration controller error:', error);
      
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Registration failed'
      });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('User-Agent');
      
      const result = await authService.login(email, password, ipAddress, userAgent);
      
      res.json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (error) {
      logger.error('Login controller error:', error);
      
      if (error.message.includes('Invalid credentials') || error.message.includes('deactivated')) {
        return res.status(401).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Login failed'
      });
    }
  }

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;
      const tokens = await authService.refreshToken(refreshToken);
      
      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: { tokens }
      });
    } catch (error) {
      logger.error('Token refresh controller error:', error);
      
      if (error.message.includes('Invalid refresh token')) {
        return res.status(401).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Token refresh failed'
      });
    }
  }

  async logout(req, res) {
    try {
      const refreshToken = req.body.refreshToken;
      const userId = req.user.id;
      
      await authService.logout(refreshToken, userId);
      
      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      logger.error('Logout controller error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
  }

  async getProfile(req, res) {
    try {
      res.json({
        success: true,
        data: { user: req.user }
      });
    } catch (error) {
      logger.error('Get profile controller error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to get profile'
      });
    }
  }
}

export default new AuthController();