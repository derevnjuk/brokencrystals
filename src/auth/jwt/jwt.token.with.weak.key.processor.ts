import { Logger } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithWeakKeyProcessor extends JwtTokenProcessor {
  constructor(private key: string) {
    super(new Logger(JwtTokenWithWeakKeyProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');
    // Enforce algorithm check to prevent 'none' algorithm usage
    const decodedHeader = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
    if (decodedHeader.alg === 'none') {
      throw new Error('Invalid token algorithm');
    }
    // Ensure the algorithm is one of the expected ones
    if (decodedHeader.alg !== 'HS256' && decodedHeader.alg !== 'RS256') {
      throw new Error('Unsupported token algorithm');
    }
    return decode(token, this.key, false, decodedHeader.alg);
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');
    return encode(payload, this.key, 'HS256');
  }
}
