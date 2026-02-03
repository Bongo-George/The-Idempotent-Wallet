import redisClient from '../config/redis';

/**
 * RedisService handles all Redis operations for idempotency and locking
 * 
 * KEY DESIGN PATTERNS:
 * 
 * 1. IDEMPOTENCY CACHE:
 *    Key: idempotency:{idempotencyKey}
 *    Value: JSON serialized transaction result
 *    TTL: 24 hours (configurable)
 *    Purpose: Fast duplicate detection without PostgreSQL query
 * 
 * 2. DISTRIBUTED LOCK:
 *    Key: lock:{idempotencyKey}
 *    Value: timestamp of lock acquisition
 *    TTL: 30 seconds (auto-release on crash)
 *    Purpose: Prevent concurrent processing across instances
 * 
 * 3. REDIS AS CACHE, NOT SOURCE OF TRUTH:
 *    - PostgreSQL is authoritative
 *    - Redis failures don't break functionality
 *    - Graceful degradation to database-only mode
 */
class RedisService {
  private readonly IDEMPOTENCY_TTL = parseInt(
    process.env.REDIS_IDEMPOTENCY_TTL || '86400'
  ); // 24 hours
  private readonly LOCK_TTL = 30; // 30 seconds
  private readonly LOCK_RETRY_DELAY = 100; // 100ms
  private readonly LOCK_MAX_RETRIES = 50; // Max 5 seconds total

  /**
   * Attempt to acquire distributed lock for idempotency key
   * 
   * Uses Redis SETNX (SET if Not eXists) for atomic lock acquisition
   * 
   * @returns true if lock acquired, false if already locked
   */
  async acquireLock(idempotencyKey: string): Promise<boolean> {
    try {
      const lockKey = `lock:${idempotencyKey}`;
      const lockValue = Date.now().toString();

      // SETNX with expiration (atomic operation)
      // Returns 1 if key was set (lock acquired)
      // Returns 0 if key already exists (lock held by another process)
      const result = await redisClient.set(
        lockKey,
        lockValue,
        'EX', // Expire in seconds
        this.LOCK_TTL,
        'NX' // Set only if Not eXists
      );

      return result === 'OK';
    } catch (error) {
      console.error('Redis lock acquisition error:', error);
      // On Redis failure, allow operation (fail open for availability)
      return true;
    }
  }

  /**
   * Release distributed lock
   */
  async releaseLock(idempotencyKey: string): Promise<void> {
    try {
      const lockKey = `lock:${idempotencyKey}`;
      await redisClient.del(lockKey);
    } catch (error) {
      console.error('Redis lock release error:', error);
      // Lock will auto-expire, so non-critical error
    }
  }

  /**
   * Acquire lock with retry logic
   * 
   * Useful when multiple clients try to process same request simultaneously
   * One gets lock immediately, others retry briefly
   */
  async acquireLockWithRetry(idempotencyKey: string): Promise<boolean> {
    for (let attempt = 0; attempt < this.LOCK_MAX_RETRIES; attempt++) {
      const acquired = await this.acquireLock(idempotencyKey);
      
      if (acquired) {
        return true;
      }

      // Wait before retry
      await this.sleep(this.LOCK_RETRY_DELAY);
    }

    return false; // Could not acquire lock after max retries
  }

  /**
   * Check if transaction result is cached in Redis
   * 
   * This is the FIRST check in transfer flow:
   * 1. Check Redis (fast)
   * 2. If miss, check PostgreSQL (slower)
   * 3. If still not found, proceed with transfer
   */
  async getCachedResult(idempotencyKey: string): Promise<any | null> {
    try {
      const cacheKey = `idempotency:${idempotencyKey}`;
      const cached = await redisClient.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      console.error('Redis cache read error:', error);
      // On Redis failure, return null (fall back to database)
      return null;
    }
  }

  /**
   * Cache successful transaction result
   * 
   * Called AFTER PostgreSQL commit to ensure consistency
   * If Redis fails here, it's non-critical (just slower next time)
   */
  async cacheResult(idempotencyKey: string, result: any): Promise<void> {
    try {
      const cacheKey = `idempotency:${idempotencyKey}`;
      await redisClient.setex(
        cacheKey,
        this.IDEMPOTENCY_TTL,
        JSON.stringify(result)
      );
    } catch (error) {
      console.error('Redis cache write error:', error);
      // Non-critical error, operation succeeded in PostgreSQL
    }
  }

  /**
   * Invalidate cached result (useful for testing or corrections)
   */
  async invalidateCache(idempotencyKey: string): Promise<void> {
    try {
      const cacheKey = `idempotency:${idempotencyKey}`;
      await redisClient.del(cacheKey);
    } catch (error) {
      console.error('Redis cache invalidation error:', error);
    }
  }

  /**
   * Health check for Redis connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await redisClient.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  /**
   * Gracefully close Redis connection (for shutdown)
   */
  async disconnect(): Promise<void> {
    await redisClient.quit();
  }

  /**
   * Utility: Sleep for retry logic
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new RedisService();