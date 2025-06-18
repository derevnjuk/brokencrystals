import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Post,
  Res,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { User } from '../model/user.entity';
import { LdapQueryHandler } from '../users/ldap.query.handler';
import { UsersService } from '../users/users.service';
import { FormMode, LoginRequest } from './api/login.request';
import { LoginResponse } from './api/LoginResponse';
import { OidcClientResponse } from './api/OidcClientResponse';
import {
  SWAGGER_DESC_CALL_OIDC_CLIENT,
  SWAGGER_DESC_LOGIN_WITH_RSA_JWT_KEYS
} from './auth.controller.swagger.desc';
import { AuthService, JwtProcessorType } from './auth.service';
import { passwordMatches } from './credentials.utils';
import { FastifyReply } from 'fastify';
import { CsrfGuard } from './csrf.guard';
import { ClientType, KeyCloakService } from '../keycloak/keycloak.service';

interface LoginData {
  email: string;
  ldapProfileLink: string;
  token: string;
}

@Controller('/api/auth')
@ApiTags('Auth controller')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly CSRF_COOKIE_HEADER = '_csrf';

  constructor(
    private readonly usersService: UsersService,
    private readonly keyCloakService: KeyCloakService,
    private readonly authService: AuthService
  ) {}

  @Post('login')
  @UseGuards(CsrfGuard)
  @ApiCreatedResponse({
    type: LoginResponse
  })
  @ApiUnauthorizedResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' }
      }
    },
    description: 'invalid credentials'
  })
  @ApiOperation({
    description: SWAGGER_DESC_LOGIN_WITH_RSA_JWT_KEYS
  })
  async loginWithRSAJwtKeys(
    @Body() req: LoginRequest,
    @Res({ passthrough: true }) res: FastifyReply
  ): Promise<LoginResponse> {
    this.logger.debug('Call loginWithRSAJwtKeys');

    let loginData: LoginData;

    if (req.op === FormMode.OIDC) {
      loginData = await this.loginOidc(req);
    } else {
      loginData = await this.loginBasic(req);
    }

    const { token, ...loginResponse } = loginData;

    res.header('authorization', token);

    return loginResponse;
  }

  @Get('oidc-client')
  @ApiResponse({
    type: OidcClientResponse,
    status: HttpStatus.OK
  })
  @ApiOperation({
    description: SWAGGER_DESC_CALL_OIDC_CLIENT
  })
  async getOidcClient(): Promise<OidcClientResponse> {
    this.logger.debug('Call getOidcClient');

    const client = this.keyCloakService.getClient(ClientType.PUBLIC);

    return {
      clientId: client.client_id,
      clientSecret: client.client_secret,
      metadataUrl: client.metadata_url
    };
  }

  private async loginOidc(req: LoginRequest): Promise<LoginData> {
    try {
      const { token_type, access_token } =
        await this.keyCloakService.generateToken({
          username: req.user,
          password: req.password
        });

      return {
        email: req.user,
        ldapProfileLink: LdapQueryHandler.LDAP_SEARCH_QUERY(req.user),
        token: `${token_type} ${access_token}`
      };
    } catch (err) {
      if (err.response?.status === 401) {
        throw new UnauthorizedException({
          error: 'Invalid credentials',
          location: __filename
        });
      }

      throw new InternalServerErrorException({
        error: err.message,
        location: __filename
      });
    }
  }

  private async loginBasic(req: LoginRequest): Promise<LoginData> {
    let user: User;

    try {
      user = await this.usersService.findByEmail(req.user);
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename
      });
    }

    if (!user || !(await passwordMatches(req.password, user.password))) {
      throw new UnauthorizedException({
        error: 'Invalid credentials',
        location: __filename
      });
    }

    if (!user.isBasic) {
      throw new ForbiddenException({
        error: 'Invalid authentication method for this user',
        location: __filename
      });
    }

    const token = await this.authService.createToken(
      {
        user: user.email,
        exp: 3600 + Math.floor(Date.now() / 1000) // Auth token expires in 1 hour
      },
      JwtProcessorType.RSA
    );

    return {
      token,
      email: user.email,
      ldapProfileLink: LdapQueryHandler.LDAP_SEARCH_QUERY(user.email)
    };
  }
}
