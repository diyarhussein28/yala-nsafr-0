import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * One log line per request (method, path, status, duration) with a request id that is
 * also returned in the X-Request-Id header, so a user-reported error can be matched to
 * the server's logs. Query strings are left out — they can carry tokens or phone numbers.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const started = process.hrtime.bigint();
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const path = (req.originalUrl ?? req.url).split('?')[0];
      const line = `${req.method} ${path} ${res.statusCode} ${ms.toFixed(0)}ms id=${id}`;
      if (res.statusCode >= 500) this.logger.error(line);
      else if (res.statusCode >= 400) this.logger.warn(line);
      else if (path !== '/api/v1/health') this.logger.log(line);
    });
    next();
  }
}
