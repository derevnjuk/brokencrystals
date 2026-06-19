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

    this.logger.error(
      exception instanceof HttpException
        ? `HTTP ${exception.getStatus()} exception`
        : exception instanceof Error
          ? exception.name
          : 'Unhandled exception',
      exception instanceof Error ? exception.stack : undefined
    );

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const responseBody = {
        error:
          status === HttpStatus.UNAUTHORIZED
            ? 'Unauthorized'
            : status >= HttpStatus.INTERNAL_SERVER_ERROR
              ? 'Internal server error'
              : 'Request failed'
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

      return applicationRef.reply(response, responseBody, status);
    }

    const unprocessableException = new InternalServerErrorException(
      { error: 'Internal server error' },
      'An internal error has occurred, and the API was unable to service your request.'
    );

    if (gql) {
      throw unprocessableException;
    }

    const applicationRef =
      this.applicationRef ||
      (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

    return applicationRef.reply(
      host.getArgByIndex(1),
      unprocessableException.getResponse(),
      unprocessableException.getStatus()
    );
  }
}
