import { Logger } from '@nestjs/common';
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
    const [header, payload] = this.parse(token);

    if (!header.jwk) {
      throw new Error('Unsupported token. JWK is not set');
    }

    if (!header.jwk.kty) {
      throw new Error('Invalid token. Key type is not set');
    }

    // Remove the check for 'none' algorithm and enforce RS256
    if (header.alg !== 'RS256') {
      throw new Error('Invalid token. Only RS256 algorithm is allowed');
    }

    const keyLike = await jose.importJWK(header.jwk);

    const res = await jose.jwtVerify(token, keyLike, {
      algorithms: ['RS256'] // Ensure only RS256 algorithm is allowed
    });

    if (res) {
      return payload;
    }
    throw new Error('Could not validate token');
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
