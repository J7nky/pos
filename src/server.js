import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/index.js';
import database from './config/database.js';
import redisClient from './config/redis.js';
import logger from './utils/logger.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import DocumentSocketHandler from './sockets/documentSocket.js';

// Routes
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import healthRoutes from './routes/health.js';

class Server {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST']
      }
    });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSockets();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: true
    }));

    // Rate limiting
    this.app.use(generalLimiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  setupRoutes() {
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/documents', documentRoutes);
    this.app.use('/api/health', healthRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Real-time Database System',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Endpoint not found'
      });
    });
  }

  setupSockets() {
    new DocumentSocketHandler(this.io);
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error:', error);
      
      res.status(500).json({
        success: false,
        message: config.nodeEnv === 'production' ? 'Internal server error' : error.message
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async start() {
    try {
      // Connect to Redis
      await redisClient.connect();
      
      // Start server
      this.server.listen(config.port, () => {
        logger.info(`Server running on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
      });
      
      // Setup periodic cleanup
      setInterval(async () => {
        try {
          const authService = await import('./services/authService.js');
          await authService.default.cleanupExpiredTokens();
        } catch (error) {
          logger.error('Token cleanup error:', error);
        }
      }, 60 * 60 * 1000); // Every hour
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Shutting down server...');
    
    try {
      // Close server
      this.server.close();
      
      // Close database connections
      await database.close();
      
      // Close Redis connection
      await redisClient.close();
      
      logger.info('Server shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start server
const server = new Server();
server.start();