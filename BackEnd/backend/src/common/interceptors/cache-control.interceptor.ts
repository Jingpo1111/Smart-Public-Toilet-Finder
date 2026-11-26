import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';

const CACHE_FOR_KEY = 'cacheFor';

/**
 * Lets browsers and CDNs reuse a successful public GET response for `maxAge` seconds and serve it
 * stale for `staleWhileRevalidate` more while refreshing in the background.
 * Only successful responses are marked cacheable; errors are never cached.
 */
export const CacheFor = (maxAge: number, staleWhileRevalidate = maxAge * 3) =>
  SetMetadata(CACHE_FOR_KEY, { maxAge, staleWhileRevalidate });

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const policy = this.reflector.get<{ maxAge: number; staleWhileRevalidate: number } | undefined>(
      CACHE_FOR_KEY,
      context.getHandler(),
    );
    if (!policy) return next.handle();
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap(() => {
        if (!res.headersSent) {
          res.setHeader(
            'Cache-Control',
            `public, max-age=${policy.maxAge}, stale-while-revalidate=${policy.staleWhileRevalidate}`,
          );
        }
      }),
    );
  }
}
