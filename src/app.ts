import express, { Application } from 'express';
import dotenv from 'dotenv';
import sequelize from './config/database';
import RedisService from './services/RedisService';
import transferRoutes from './routes/transfer.routes';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (includes Redis status)
app.get('/health', async (_req, res) => {
  const redisHealthy = await RedisService.healthCheck();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected',
      redis: redisHealthy ? 'connected' : 'disconnected',
    },
  });
});

// Routes
app.use('/api', transferRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Database and Redis connection, then server startup
async function startServer() {
  try {
    // Test PostgreSQL connection
    await sequelize.authenticate();
    console.log('✓ PostgreSQL connection established successfully');

    // Test Redis connection
    const redisHealthy = await RedisService.healthCheck();
    if (redisHealthy) {
      console.log('✓ Redis connection established successfully');
    } else {
      console.warn('⚠ Redis unavailable - running in degraded mode (database only)');
    }

    // Sync models (use migrations in production)
    if (process.env.NODE_ENV !== 'production') {
      await sequelize.sync({ alter: false });
      console.log('✓ Database models synchronized');
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('✗ Unable to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await RedisService.disconnect();
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await RedisService.disconnect();
  await sequelize.close();
  process.exit(0);
});

// Start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;