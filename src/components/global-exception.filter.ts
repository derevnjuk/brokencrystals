import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  InternalServerErrorException
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlContextType } from '@nestjs/graphql';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost) {
    const gql = host.getType<GqlContextType>() === 'graphql';

    if (exception instanceof HttpException) {
      if (gql) {
        throw exception;
      }

      const applicationRef =
        this.applicationRef ||
        (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);
      const status = exception.getStatus();

      return applicationRef.reply(
        host.getArgByIndex(1),
        {
          error:
            status === HttpStatus.UNAUTHORIZED
              ? 'Unauthorized'
              : status >= HttpStatus.INTERNAL_SERVER_ERROR
                ? 'Internal server error'
                : 'Request failed'
        },
        status
      );
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
