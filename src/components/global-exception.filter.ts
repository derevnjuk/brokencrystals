import {
  ArgumentsHost,
  Catch,
  HttpException,
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

      // Modify the response to avoid leaking sensitive information
      const response = exception.getResponse();
      const status = exception.getStatus();

      const sanitizedResponse = {
        error: typeof response === 'string' ? response : response['error'],
        message: 'An error occurred. Please try again later.'
      };

      const applicationRef =
        this.applicationRef ||
        (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

      return applicationRef.reply(
        host.getArgByIndex(1),
        sanitizedResponse,
        status
      );
    }

    const unprocessableException = new InternalServerErrorException(
      { error: 'An internal error has occurred.' },
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
