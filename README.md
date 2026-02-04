# Fintech Wallet Backend - Production-Grade Wallet Service

A production-ready wallet service with idempotency support, transaction safety, and Redis caching for high-performance financial operations.

## Features

- ✅ **Idempotent Transfers** - Safe duplicate request handling using idempotency keys
- ✅ **Distributed Locking** - Redis-based locks prevent concurrent processing
- ✅ **Transaction Safety** - Database transactions with READ_COMMITTED isolation level
- ✅ **Precision Decimal Handling** - Strings used for DECIMAL storage to avoid float precision loss
- ✅ **Redis Caching** - 24-hour cache for idempotent request results
- ✅ **Connection Pooling** - Optimized database connection management
- ✅ **Comprehensive Error Handling** - Detailed error responses with status codes

## Prerequisites

- **Node.js** v22.15.0 or higher
- **PostgreSQL** 13+ running on localhost:5432
- **Redis** running on localhost:6379
- **Docker** (optional, for running Redis in container)

## Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your database and Redis credentials:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=wallet_db
   DB_USER=postgres
   DB_PASSWORD=password
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

3. **Start Redis (if not already running):**
   ```bash
   docker run -d -p 6379:6379 --name redis redis
   ```

## Database Setup

1. **Run migrations:**
   ```bash
   npm run migrate
   ```
   
   This creates:
   - `wallets` table (with UUID primary key, userId, balance, version)
   - `transaction_logs` table (with status, idempotencyKey, foreign keys)

2. **Seed test wallets:**
   ```bash
   npx ts-node seed-test-wallets.ts
   npx ts-node create-test-wallet.ts
   npx ts-node create-test-wallet-diana.ts
   npx ts-node create-test-wallet-eve.ts
   ```

   Or use the comprehensive seed:
   ```bash
   npx ts-node seed-comprehensive-wallets.ts
   ```

## Running the Application

**Development mode (with hot reload):**
```bash
npm run dev
```

**Production build and run:**
```bash
npm run build
npm start
```

The server runs on `http://localhost:3000`

## API Endpoints

### 1. Health Check
**Request:**
```
GET /health
```

**Expected Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-02-04T10:30:45.123Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

---

### 2. Transfer Money
**Request:**
```
POST /api/transfer
Content-Type: application/json
```

**Body:**
```json
{
  "fromWalletId": "11111111-1111-1111-1111-111111111112",
  "toWalletId": "22222222-2222-2222-2222-222222222222",
  "amount": "100.0000",
  "idempotencyKey": "transfer-001"
}
```

**Expected Response (200 OK - First Time):**
```json
{
  "success": true,
  "transactionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Transfer completed successfully",
  "fromBalance": "900.0000",
  "toBalance": "600.0000"
}
```

**Expected Response (200 OK - Duplicate Request with Same idempotencyKey):**
```json
{
  "success": true,
  "transactionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Transfer already processed (idempotent request) (from cache)",
  "fromBalance": "900.0000",
  "toBalance": "600.0000"
}
```

**Error Response - Insufficient Balance (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance. Available: 500.0000, Required: 1000.0000"
  }
}
```

**Error Response - Same Wallet Transfer (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "SAME_WALLET_TRANSFER",
    "message": "Cannot transfer to the same wallet"
  }
}
```

**Error Response - Invalid Wallet ID Format (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_WALLET_ID",
    "message": "Invalid wallet ID format"
  }
}
```

**Error Response - Negative Amount (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_AMOUNT",
    "message": "Amount must be a positive number"
  }
}
```

**Error Response - Missing Fields (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Missing required fields"
  }
}
```

**Error Response - Wallet Not Found (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "WALLET_NOT_FOUND",
    "message": "One or both wallets not found"
  }
}
```

---

### 3. Get Wallet Balance
**Request:**
```
GET /api/wallet/11111111-1111-1111-1111-111111111112/balance
```

**Expected Response (200 OK):**
```json
{
  "walletId": "11111111-1111-1111-1111-111111111112",
  "balance": "900.0000",
  "currency": "USD"
}
```

**Error Response - Wallet Not Found (404 Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "WALLET_NOT_FOUND",
    "message": "Wallet not found"
  }
}
```

---

### 4. Get Transaction History
**Request:**
```
GET /api/wallet/11111111-1111-1111-1111-111111111112/transactions
```

**Expected Response (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "fromWalletId": "11111111-1111-1111-1111-111111111112",
    "toWalletId": "22222222-2222-2222-2222-222222222222",
    "amount": "100.0000",
    "status": "SUCCESS",
    "idempotencyKey": "transfer-001",
    "errorMessage": null,
    "metadata": {
      "requestedAt": "2026-02-04T10:30:45.123Z",
      "completedAt": "2026-02-04T10:30:45.456Z",
      "fromBalanceAfter": "900.0000",
      "toBalanceAfter": "600.0000"
    },
    "createdAt": "2026-02-04T10:30:45.123Z",
    "updatedAt": "2026-02-04T10:30:45.456Z"
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "fromWalletId": "22222222-2222-2222-2222-222222222222",
    "toWalletId": "11111111-1111-1111-1111-111111111112",
    "amount": "50.0000",
    "status": "SUCCESS",
    "idempotencyKey": "transfer-002",
    "errorMessage": null,
    "metadata": {
      "requestedAt": "2026-02-04T10:35:10.123Z",
      "completedAt": "2026-02-04T10:35:10.456Z",
      "fromBalanceAfter": "450.0000",
      "toBalanceAfter": "950.0000"
    },
    "createdAt": "2026-02-04T10:35:10.123Z",
    "updatedAt": "2026-02-04T10:35:10.456Z"
  },
  {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "fromWalletId": "11111111-1111-1111-1111-111111111112",
    "toWalletId": "22222222-2222-2222-2222-222222222222",
    "amount": "2000.0000",
    "status": "FAILED",
    "idempotencyKey": "transfer-003",
    "errorMessage": "Insufficient balance. Available: 950.0000, Required: 2000.0000",
    "metadata": {
      "requestedAt": "2026-02-04T10:40:20.123Z",
      "failedAt": "2026-02-04T10:40:20.789Z"
    },
    "createdAt": "2026-02-04T10:40:20.123Z",
    "updatedAt": "2026-02-04T10:40:20.789Z"
  }
]
```

**Empty Response (No Transactions):**
```json
[]
```


## Test Wallets

After seeding, you have these test wallets available:

| User | ID | Balance |
|------|---|---------|
| Alice | `11111111-1111-1111-1111-111111111111` | $1000 |
| Bob | `22222222-2222-2222-2222-222222222222` | $500 |
| Charlie | `33333333-3333-3333-3333-333333333333` | $2000 |
| Diana | `44444444-4444-4444-4444-444444444444` | $1500 |
| Eve | `55555555-5555-5555-5555-555555555555` | $3000 |

## Testing with Postman

### 1. Basic Transfer
```json
{
  "fromWalletId": "11111111-1111-1111-1111-111111111111",
  "toWalletId": "22222222-2222-2222-2222-222222222222",
  "amount": "100.0000",
  "idempotencyKey": "alice-to-bob-001"
}
```

### 2. Idempotency Test (Send same request twice)
First request: `"message": "Transfer completed successfully"`
Second request: `"message": "Transfer already processed (idempotent request) (from cache)"`

### 3. Insufficient Funds (Should fail)
```json
{
  "fromWalletId": "22222222-2222-2222-2222-222222222222",
  "toWalletId": "11111111-1111-1111-1111-111111111111",
  "amount": "10000.0000",
  "idempotencyKey": "insufficient-funds"
}
```

### 4. Missing Fields (Should fail)
```json
{
  "fromWalletId": "11111111-1111-1111-1111-111111111111",
  "toWalletId": "22222222-2222-2222-2222-222222222222",
  "amount": "50.0000"
}
```

## Project Structure

```
fintech-backend/
├── src/
│   ├── app.ts                 # Express app setup
│   ├── config/
│   │   ├── database.ts        # Sequelize configuration
│   │   ├── redis.ts           # Redis client setup
│   │   └── sequelize.ts       # CLI migration config
│   ├── controllers/
│   │   └── TransferController.ts
│   ├── services/
│   │   ├── TransferService.ts # Core business logic
│   │   └── RedisService.ts    # Redis operations
│   ├── models/
│   │   ├── Wallet.ts
│   │   ├── TransactionLog.ts
│   │   └── index.ts
│   ├── routes/
│   │   └── transfer.routes.ts
│   ├── middleware/
│   │   └── errorHandler.ts
│   └── types/
│       └── index.ts
├── migrations/
│   ├── 20240101000001-create-wallets.js
│   └── 20240101000002-create-transaction-logs.js
├── tests/
│   └── transfer.test.ts
├── dist/                      # Compiled JavaScript
├── package.json
├── tsconfig.json
├── .sequelizerc               # Sequelize CLI config
└── .env.example               # Environment template
```

## Key Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run dev` | Run development server with hot reload |
| `npm start` | Run production server |
| `npm run migrate` | Run database migrations |
| `npm run migrate:undo` | Rollback last migration |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |

## Environment Variables

```
NODE_ENV=development
PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wallet_db
DB_USER=postgres
DB_PASSWORD=password
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_POOL_ACQUIRE=30000
DB_POOL_IDLE=10000

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=wallet:
REDIS_IDEMPOTENCY_TTL=86400
```

## Transfer Execution Flow

1. **Check Redis Cache** - Return immediately if idempotency key exists
2. **Acquire Distributed Lock** - Prevent concurrent processing
3. **Check Database** - Verify transaction not already recorded
4. **Execute Transfer** - Database transaction with wallet locking
5. **Cache Result** - Store in Redis for 24 hours
6. **Release Lock** - Always release lock in finally block

## Error Handling

Common error responses:

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Missing required fields | Invalid request payload |
| 400 | Insufficient funds | Source wallet balance too low |
| 409 | Duplicate request detected | Unique constraint violation on idempotencyKey |
| 409 | Concurrent processing | Another instance processing same request |
| 500 | Transfer failed | Unexpected server error |

## Development Notes

- All DECIMAL amounts stored as strings to preserve precision
- Wallets are locked in consistent order (by ID) to prevent deadlocks
- Transactions use READ_COMMITTED isolation level
- Redis connections auto-reconnect with exponential backoff
- Errors logged with full context for debugging

## Running Tests

```bash
npm test
```

Tests validate:
- Transfer execution with balance updates
- Idempotency enforcement
- Insufficient funds errors
- Concurrent request handling
- Transaction rollback on errors

## License

Proprietary - Production-Grade Fintech Service
