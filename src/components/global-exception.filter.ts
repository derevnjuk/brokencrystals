import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlContextType } from '@nestjs/graphql';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost) {
    const gql = host.getType<GqlContextType>() === 'graphql';
    const request = !gql ? host.switchToHttp().getRequest() : undefined;
    const sanitizedHeaders: Record<string, string | string[] | undefined> = {};
    const rawHeaders = request?.headers || {};

    for (const [key, value] of Object.entries(rawHeaders)) {
      sanitizedHeaders[key] =
        key.toLowerCase() === 'authorization' || key.toLowerCase() === 'cookie'
          ? '[REDACTED]'
          : value;
    }

    this.logger.error(
      exception instanceof HttpException
        ? `HTTP ${exception.getStatus()} exception`
        : exception instanceof Error
          ? exception.name
          : 'Unhandled exception',
      JSON.stringify({
        path: request?.url ? request.url.split('?')[0] : undefined,
        method: request?.method,
        headers: sanitizedHeaders,
        error:
          exception instanceof Error
            ? exception.name
            : typeof exception === 'string'
              ? exception
              : 'Unhandled exception'
      })
    );

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const sanitizedMessage =
        status === HttpStatus.UNAUTHORIZED
          ? 'Unauthorized'
          : status === HttpStatus.NOT_FOUND
            ? 'Not Found'
            : status === HttpStatus.FORBIDDEN
              ? 'Forbidden'
              : status >= HttpStatus.INTERNAL_SERVER_ERROR
                ? 'Internal server error'
                : 'Request failed';
      const responseBody = {
        statusCode: status,
        error: sanitizedMessage,
        message: sanitizedMessage
      };

      if (gql) {
        throw new HttpException(responseBody, status);
      }

      const applicationRef =
        this.applicationRef ||
        (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);
      const response = host.getArgByIndex(1);

      if (response?.raw?.headersSent || response?.sent) {
        return;
      }

      if (response?.header) {
        response.header('Content-Type', 'application/json; charset=utf-8');
        response.header('Cache-Control', 'no-store');
        response.header('X-Content-Type-Options', 'nosniff');
        response.header('Content-Security-Policy', "default-src 'none'");
      }

      return applicationRef.reply(response, responseBody, status);
    }

    const unprocessableException = new InternalServerErrorException({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal server error',
      message: 'Internal server error'
    });

    if (gql) {
      throw unprocessableException;
    }

    const applicationRef =
      this.applicationRef ||
      (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

    const response = host.getArgByIndex(1);

    if (response?.raw?.headersSent || response?.sent) {
      return;
    }

    if (response?.header) {
      response.header('Content-Type', 'application/json; charset=utf-8');
      response.header('Cache-Control', 'no-store');
      response.header('X-Content-Type-Options', 'nosniff');
      response.header('Content-Security-Policy', "default-src 'none'");
    }

    return applicationRef.reply(
      response,
      unprocessableException.getResponse(),
      unprocessableException.getStatus()
    );
  }
}
