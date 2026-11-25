import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

export interface ErrorBody {
  success: false;
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/**
 * Converts every error into a safe JSON body. Stack traces, SQL and internal messages are never
 * returned to clients; unexpected errors are logged server-side and reported as a generic 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, message, details } = this.resolve(exception, req);
    const body: ErrorBody = {
      success: false,
      statusCode: status,
      error: STATUS_TEXT[status] ?? 'Error',
      message,
      ...(details !== undefined ? { details } : {}),
      path: req.originalUrl?.split('?')[0] ?? req.url,
      timestamp: new Date().toISOString(),
    };
    if (res.headersSent) return;
    res.status(status).json(body);
  }

  private resolve(exception: unknown, req: Request): { status: number; message: string; details?: unknown } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') return { status, message: response };
      const r = response as { message?: unknown; details?: unknown };
      if (Array.isArray(r.message)) {
        return { status, message: 'Validation failed', details: r.details ?? r.message };
      }
      if (status >= 500) this.logger.error(`${req.method} ${req.url} → ${status}: ${String(r.message)}`);
      return {
        status,
        message: typeof r.message === 'string' ? r.message : exception.message,
        details: r.details,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return { status: HttpStatus.CONFLICT, message: 'A record with the same unique value already exists.' };
        case 'P2025':
          return { status: HttpStatus.NOT_FOUND, message: 'The requested record was not found.' };
        case 'P2003':
          return { status: HttpStatus.BAD_REQUEST, message: 'A referenced record does not exist.' };
        case 'P2034':
          return {
            status: HttpStatus.CONFLICT,
            message: 'The record was modified concurrently. Please retry the request.',
          };
        default:
          break;
      }
    }

    // Body-parser errors (malformed JSON, payload too large) carry a status/type.
    const maybe = exception as { status?: number; type?: string; message?: string };
    if (maybe?.type === 'entity.parse.failed') {
      return { status: HttpStatus.BAD_REQUEST, message: 'Malformed JSON request body.' };
    }
    if (maybe?.type === 'entity.too.large') {
      return { status: HttpStatus.PAYLOAD_TOO_LARGE, message: 'Request body is too large.' };
    }

    this.logger.error(
      `Unhandled error on ${req.method} ${req.url}: ${(exception as Error)?.message ?? String(exception)}`,
      (exception as Error)?.stack,
    );
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'An unexpected error occurred. Please try again later.' };
  }
}
