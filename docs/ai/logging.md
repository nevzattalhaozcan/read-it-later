# Logging Standards

This project uses structured logging to improve observability and debugging across the API and Web applications.

## API (Backend)

The API uses [Pino](https://getpino.io/) for high-performance, structured JSON logging.

### Logger Utility
Located at `apps/api/src/lib/logger.ts`.

### Usage
```typescript
import { logger } from './lib/logger.js';

// Simple message
logger.info('Server started');

// With context
logger.info({ userId, articleId }, 'Article updated');

// Errors
try {
  // ...
} catch (error) {
  logger.error({ error }, 'Operation failed');
}
```

### Features
1. **Request Correlation**: Every request is assigned a unique `requestId` (via `X-Request-Id` header). This ID is included in all logs related to that request.
2. **HTTP Logging**: Every incoming request is automatically logged with its method, URL, status code, and duration.
3. **Pretty Printing**: In development (`NODE_ENV !== 'production'`), logs are formatted for readability using `pino-pretty`.
4. **Log Levels**: Supported levels are `debug`, `info`, `warn`, `error`. Default is `info`. Can be overridden via `LOG_LEVEL` environment variable.

---

## Web (Frontend)

The Web application uses a lightweight custom logger utility that wraps standard `console` methods with environment-aware filtering and consistent prefixing.

### Logger Utility
Located at `apps/web/src/utils/logger.ts`.

### Usage
```typescript
import { logger } from './utils/logger';

logger.debug('State change', state);
logger.info('Connected to sync server');
logger.warn('Highlight failed', { id });
logger.error('API call failed', error);
```

### Features
1. **Consistent Prefix**: All logs are prefixed with `[sonra-okurum]` for easy filtering in the browser console.
2. **Environment Filtering**:
   - Development: Defaults to `debug` level (shows all logs).
   - Production: Defaults to `info` level (hides `debug` logs).
   - Can be overridden via `VITE_LOG_LEVEL` environment variable.
3. **Performance**: In production, low-level logs are completely skipped to reduce overhead.
