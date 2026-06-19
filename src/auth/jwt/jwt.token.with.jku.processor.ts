import { Logger, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { HttpClientService } from '../../httpclient/httpclient.service';
import { JwtTokenProcessor as JwtTokenProcessor } from './jwt.token.processor';

export class JwtTokenWithJKUProcessor extends JwtTokenProcessor {
  constructor(
    private key: string,
    private httpClient: HttpClientService,
    private jkuUrl: string
  ) {
    super(new Logger(JwtTokenWithJKUProcessor.name));
  }

  async validateToken(token: string): Promise<unknown> {
    this.log.debug('Call validateToken');

    try {
      const [header, payload] = this.parse(token);

      if (!header?.jku || header.jku !== this.jkuUrl) {
        throw new UnauthorizedException({ error: 'Unauthorized' });
      }

      this.log.debug('Calling configured jwk url');
      const jwkRes: jose.JWK = await this.httpClient.loadJSON(this.jkuUrl);
      const keyLike = await jose.importJWK(jwkRes);
      await jose.jwtVerify(token, keyLike);

      return payload;
    } catch (error) {
      this.log.warn('JKU token validation failed');

      if (error instanceof UnauthorizedException) {
        throw error;
      }

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
        jku: this.jkuUrl
      })
      .sign(pkcs8);
  }
}
