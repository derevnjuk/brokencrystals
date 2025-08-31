import { Logger } from '@nestjs/common';
import { decode, encode } from 'jwt-simple';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithRSASignatureKeysProcessor extends JwtTokenProcessor {
  constructor(
    private publicKey: string,
    private privateKey: string
  ) {
    super(new Logger(JwtTokenWithRSASignatureKeysProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    // Ensure the algorithm is enforced to RS256
    const decodedHeader = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
    if (decodedHeader.alg !== 'RS256') {
      throw new Error('Invalid token algorithm');
    }

    // Verify the token signature using the public key
    try {
      return decode(token, this.publicKey, true, 'RS256');
    } catch (error) {
      this.log.error('Token validation failed', error);
      throw new Error('Invalid token signature');
    }
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const token = encode(payload, this.privateKey, 'RS256');
    return token;
  }
}