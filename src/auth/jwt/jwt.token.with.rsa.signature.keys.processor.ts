import { Logger, UnauthorizedException } from '@nestjs/common';
import { encode } from 'jwt-simple';
import { createPublicKey, verify } from 'crypto';
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

    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      throw new UnauthorizedException('Invalid token');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = tokenParts;
    const decodedHeader = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8')
    ) as { alg?: string; typ?: string };

    if (decodedHeader.alg !== 'RS256') {
      throw new UnauthorizedException('Invalid token algorithm');
    }

    const verifierInput = `${encodedHeader}.${encodedPayload}`;
    const isValid = verify(
      'RSA-SHA256',
      Buffer.from(verifierInput, 'utf8'),
      createPublicKey(this.publicKey),
      Buffer.from(encodedSignature, 'base64url')
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid token signature');
    }

    return JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );
  }

  async createToken(payload: unknown): Promise<string> {
    this.log.debug('Call createToken');

    const token = encode(payload, this.privateKey, 'RS256');
    return token;
  }
}
