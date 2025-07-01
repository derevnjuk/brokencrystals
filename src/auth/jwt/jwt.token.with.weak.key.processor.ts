import { Logger } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithWeakKeyProcessor extends JwtTokenProcessor {
  constructor(private key: string) {
    super(new Logger(JwtTokenWithWeakKeyProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');
    // Ensure the token is not using the 'none' algorithm
    const decodedHeader = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
    if (decodedHeader.alg === 'none') {
      throw new Error('Invalid token algorithm: none');
    }
    // Enforce the use of a specific algorithm for decoding
    return decode(token, this.key, false, 'HS256');
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');
    return encode(payload, this.key, 'HS256');
  }
}
