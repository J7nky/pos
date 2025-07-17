import express from 'express';
import database from '../config/database.js';
import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {}
    };

    // Check database
    const dbHealth = await database.healthCheck();
    health.services.database = dbHealth;

    // Check Redis
    const redisHealth = await redisClient.healthCheck();
    health.services.redis = redisHealth;

    // Overall status
    const allHealthy = Object.values(health.services).every(service => service.status === 'healthy');
    health.status = allHealthy ? 'healthy' : 'degraded';

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

export default router;