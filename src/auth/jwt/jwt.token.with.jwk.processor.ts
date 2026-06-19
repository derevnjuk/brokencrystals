import { Logger, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithJWKProcessor extends JwtTokenProcessor {
  constructor(
    private key: string,
    private jwk: jose.JWK
  ) {
    super(new Logger(JwtTokenWithJWKProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    if (typeof token !== 'string' || token.length > 8192) {
      throw new UnauthorizedException({ error: 'Unauthorized' });
    }

    try {
      const [header, payload] = this.parse(token);
      const jwk =
        header && typeof header === 'object' && !Array.isArray(header)
          ? (header as { jwk?: unknown }).jwk
          : undefined;

      if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) {
        throw new UnauthorizedException({ error: 'Unauthorized' });
      }

      if (!(jwk as { kty?: unknown }).kty || typeof (jwk as { kty?: unknown }).kty !== 'string') {
        throw new UnauthorizedException({ error: 'Unauthorized' });
      }

      const keyLike = await jose.importJWK(jwk as jose.JWK);
      const res = await jose.jwtVerify(token, keyLike);

      if (res) {
        return payload;
      }
      throw new UnauthorizedException({ error: 'Unauthorized' });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.log.warn('Failed to validate JWT with JWK');
      throw new UnauthorizedException({ error: 'Unauthorized' });
    }
  }

  async createToken(payload: jose.JWTPayload): Promise<string> {
    this.log.debug('Call createToken');
    const pkcs8 = await jose.importPKCS8(this.key, 'RS256');
    return new jose.SignJWT(payload)
      .setProtectedHeader({
        typ: 'JWT',
        alg: 'RS256',
        jwk: this.jwk
      })
      .sign(pkcs8);
  }
}
