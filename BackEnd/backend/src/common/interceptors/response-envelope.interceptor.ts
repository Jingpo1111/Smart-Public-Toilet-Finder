import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { PaginatedResult } from '../dto/pagination.dto';

export const DEFAULT_SUCCESS_MESSAGE = 'Request completed successfully';

/**
 * Wraps every successful response:
 *   { "success": true, "data": ..., "message": "..." }
 * Paginated results additionally carry:
 *   "meta": { "page", "limit", "total", "totalPages" }
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [context.getHandler(), context.getClass()]) ??
      DEFAULT_SUCCESS_MESSAGE;

    return next.handle().pipe(
      map((body: unknown) => {
        if (body instanceof StreamableFile) return body;
        if (body instanceof PaginatedResult) {
          return { success: true, data: body.items, meta: body.meta, message };
        }
        return { success: true, data: body ?? null, message };
      }),
    );
  }
}
