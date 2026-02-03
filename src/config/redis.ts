import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis Client Configuration
 
 */

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  
  // Key prefix for namespace isolation
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'wallet:',
  
  // Retry strategy for production resilience
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  
  // Connection timeout
  connectTimeout: 10000,
  
  // Lazy connect (don't block startup)
  lazyConnect: false,
  
  // Enable offline queue
  enableOfflineQueue: true,
  
  // Max retry attempts
  maxRetriesPerRequest: 3,
});

// Event handlers for monitoring
redisClient.on('connect', () => {
  console.log('✓ Redis connection established');
});

redisClient.on('error', (error) => {
  console.error('✗ Redis connection error:', error.message);
});

redisClient.on('close', () => {
  console.warn('⚠ Redis connection closed');
});

redisClient.on('reconnecting', () => {
  console.log('↻ Redis reconnecting...');
});

export default redisClient;