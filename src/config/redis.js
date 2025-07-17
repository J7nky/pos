import { createClient } from 'redis';
import { config } from './index.js';
import logger from '../utils/logger.js';

class RedisClient {
  constructor() {
    this.client = createClient({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.error('Redis server refused connection');
          return new Error('Redis server refused connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          logger.error('Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          logger.error('Redis max retry attempts reached');
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error', err);
    });

    this.client.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('end', () => {
      logger.info('Redis connection ended');
    });
  }

  async connect() {
    try {
      await this.client.connect();
      logger.info('Redis client connected');
    } catch (error) {
      logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  async set(key, value, expiration = null) {
    try {
      const serializedValue = JSON.stringify(value);
      if (expiration) {
        await this.client.setEx(key, expiration, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }
    } catch (error) {
      logger.error('Redis SET error', { key, error: error.message });
      throw error;
    }
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis GET error', { key, error: error.message });
      throw error;
    }
  }

  async del(key) {
    try {
      return await this.client.del(key);
    } catch (error) {
      logger.error('Redis DEL error', { key, error: error.message });
      throw error;
    }
  }

  async exists(key) {
    try {
      return await this.client.exists(key);
    } catch (error) {
      logger.error('Redis EXISTS error', { key, error: error.message });
      throw error;
    }
  }

  async publish(channel, message) {
    try {
      return await this.client.publish(channel, JSON.stringify(message));
    } catch (error) {
      logger.error('Redis PUBLISH error', { channel, error: error.message });
      throw error;
    }
  }

  async subscribe(channel, callback) {
    try {
      const subscriber = this.client.duplicate();
      await subscriber.connect();
      await subscriber.subscribe(channel, (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          callback(parsedMessage);
        } catch (error) {
          logger.error('Error parsing Redis message', { channel, error: error.message });
        }
      });
      return subscriber;
    } catch (error) {
      logger.error('Redis SUBSCRIBE error', { channel, error: error.message });
      throw error;
    }
  }

  async healthCheck() {
    try {
      const result = await this.client.ping();
      return { status: 'healthy', response: result };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async close() {
    try {
      await this.client.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection', error);
    }
  }
}

export default new RedisClient();