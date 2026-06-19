import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HeadersConfiguratorInterceptor } from './components/headers.configurator.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import session from '@fastify/session';
import { GlobalExceptionFilter } from './components/global-exception.filter';
import * as os from 'os';
import { readFileSync, readFile } from 'fs';
import cluster from 'cluster';
import {
  FastifyAdapter,
  NestFastifyApplication
} from '@nestjs/platform-fastify';
import fmp from '@fastify/multipart';
import { randomBytes } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import fastify from 'fastify';
import { fastifyStatic } from '@fastify/static';
import { join } from 'path';
import rawbody from 'raw-body';

async function bootstrap() {
  http.globalAgent.maxSockets = Infinity;
  https.globalAgent.maxSockets = Infinity;

  const letsEncryptCertPath =
    process.env.TLS_CERT_PATH || '/etc/letsencrypt/live/pureflow.com/fullchain.pem';
  const letsEncryptKeyPath =
    process.env.TLS_KEY_PATH || '/etc/letsencrypt/live/pureflow.com/privkey.pem';
  const useHttps =
    process.env.NODE_ENV === 'production' &&
    process.env.DISABLE_HTTPS !== 'true' &&
    process.env.URL?.startsWith('https://');

  let httpsOptions;

  if (useHttps) {
    try {
      httpsOptions = {
        cert: readFileSync(letsEncryptCertPath),
        key: readFileSync(letsEncryptKeyPath)
      };
    } catch {
      console.error('Failed to initialize HTTPS certificates');
      process.exit(1);
    }
  }

  const server = fastify({
    logger:
      process.env.FASTIFY_LOGGER === 'true'
        ? { level: process.env.FASTIFY_LOG_LEVEL || 'warn' }
        : false,
    trustProxy: true,
    onProtoPoisoning: 'ignore',
    frameworkErrors: (error, req, res) => {
      server.log.error({
        name: error?.name,
        path: req.url ? req.url.split('?')[0] : '',
        method: req.method,
        details: error instanceof Error ? error.stack : String(error)
      });

      if (!res.headersSent) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'");
        res.end(
          JSON.stringify({
            statusCode: 400,
            error: 'Request failed',
            message: 'Request failed'
          })
        );
      }

      return error;
    },
    https: httpsOptions
  });

  server.setErrorHandler((error, request, reply) => {
    const requestPath = request.url ? request.url.split('?')[0] : '';
    const rawStatusCode = Number(error?.statusCode);
    const statusCode =
      Number.isInteger(rawStatusCode) && rawStatusCode >= 400 && rawStatusCode < 500
        ? rawStatusCode
        : 500;

    const sanitizedErrorMessage =
      statusCode === 401
        ? 'Unauthorized'
        : statusCode < 500
          ? 'Request failed'
          : 'Internal server error';

    const sanitizedHeaders: Record<string, string | string[] | undefined> = {};
    const rawHeaders = request.headers || {};

    for (const [key, value] of Object.entries(rawHeaders)) {
      sanitizedHeaders[key] =
        key.toLowerCase() === 'authorization' || key.toLowerCase() === 'cookie'
          ? '[REDACTED]'
          : value;
    }

    server.log.error({
      name: error?.name,
      statusCode,
      path: requestPath,
      method: request.method,
      headers: sanitizedHeaders,
      details: error instanceof Error ? error.stack : String(error)
    });

    if (!reply.sent) {
      reply
        .code(statusCode)
        .type('application/json; charset=utf-8')
        .header('Cache-Control', 'no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Security-Policy', "default-src 'none'")
        .header('X-Frame-Options', 'DENY')
        .header('Referrer-Policy', 'no-referrer')
        .send({
          statusCode,
          error: sanitizedErrorMessage,
          message: sanitizedErrorMessage
        });
    }
  });

  server.addHook('onRequest', (req, res, done) => {
    const requestPath = req.url ? req.url.split('?')[0] : '';
    let normalizedPath = requestPath;

    try {
      normalizedPath = decodeURIComponent(requestPath);
    } catch {
      normalizedPath = requestPath;
    }

    normalizedPath = normalizedPath.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();

    if (
      normalizedPath.includes('/.git') ||
      normalizedPath === '.git' ||
      normalizedPath.startsWith('.git/') ||
      normalizedPath.includes('/.hg') ||
      normalizedPath === '.hg' ||
      normalizedPath.startsWith('.hg/') ||
      normalizedPath.includes('/.svn') ||
      normalizedPath === '.svn' ||
      normalizedPath.startsWith('.svn/')
    ) {
      res.statusCode = 404;
      res.header('Content-Type', 'application/json; charset=utf-8');
      res.send({
        success: false,
        error: {
          kind: 'user_input',
          message: 'Not Found'
        }
      });
      return;
    }

    done();
  });

  server.setDefaultRoute((req, res) => {
    const requestPath = req.url ? req.url.split('?')[0] : '';
    let normalizedPath = requestPath;

    try {
      normalizedPath = decodeURIComponent(requestPath);
    } catch {
      normalizedPath = requestPath;
    }

    normalizedPath = normalizedPath.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();

    if (
      normalizedPath.includes('/.git') ||
      normalizedPath === '.git' ||
      normalizedPath.startsWith('.git/') ||
      normalizedPath.includes('/.hg') ||
      normalizedPath === '.hg' ||
      normalizedPath.startsWith('.hg/') ||
      normalizedPath.includes('/.svn') ||
      normalizedPath === '.svn' ||
      normalizedPath.startsWith('.svn/')
    ) {
      res.statusCode = 404;
      return res.end(
        JSON.stringify({
          success: false,
          error: {
            kind: 'user_input',
            message: 'Not Found'
          }
        })
      );
    }

    if (requestPath.startsWith('/api')) {
      res.statusCode = 404;
      return res.end(
        JSON.stringify({
          success: false,
          error: {
            kind: 'user_input',
            message: 'Not Found'
          }
        })
      );
    }

    readFile(
      join(__dirname, '..', 'client', 'dist', 'index.html'),
      'utf8',
      (err, data) => {
        if (err) {
          res.statusCode = 500;
          res.end('Internal Server Error');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html');
        res.end(data);
      }
    );
  });

  await server.register(fastifyStatic, {
    root: join(__dirname, '..', 'client', 'dist'),
    prefix: `/`,
    decorateReply: false,
    redirect: false,
    wildcard: false,
    serveDotFiles: false,
    ignoreTrailingSlash: true,
    allowedPath: (_pathName, root, request) => {
      const requestPath = request.url.split('?')[0];
      let normalizedPath = requestPath;

      try {
        normalizedPath = decodeURIComponent(requestPath);
      } catch {
        normalizedPath = requestPath;
      }

      normalizedPath = normalizedPath.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();

      return !(
        normalizedPath.includes('/.git') ||
        normalizedPath === '.git' ||
        normalizedPath.startsWith('.git/') ||
        normalizedPath.includes('/.hg') ||
        normalizedPath === '.hg' ||
        normalizedPath.startsWith('.hg/') ||
        normalizedPath.includes('/.svn') ||
        normalizedPath === '.svn' ||
        normalizedPath.startsWith('.svn/')
      );
    }
  });


  const adapter = new FastifyAdapter(server);
  adapter.setErrorHandler((error, request, reply) => {
    const requestPath = request.url ? request.url.split('?')[0] : '';
    const rawStatusCode = Number((error as { statusCode?: unknown })?.statusCode);
    const statusCode =
      Number.isInteger(rawStatusCode) && rawStatusCode >= 400 && rawStatusCode < 500
        ? rawStatusCode
        : 500;

    const sanitizedErrorMessage =
      statusCode === 401
        ? 'Unauthorized'
        : statusCode < 500
          ? 'Request failed'
          : 'Internal server error';

    const sanitizedHeaders: Record<string, string | string[] | undefined> = {};
    const rawHeaders = request.headers || {};

    for (const [key, value] of Object.entries(rawHeaders)) {
      sanitizedHeaders[key] =
        key.toLowerCase() === 'authorization' || key.toLowerCase() === 'cookie'
          ? '[REDACTED]'
          : value;
    }

    server.log.error({
      name: error?.name,
      statusCode,
      path: requestPath,
      method: request.method,
      headers: sanitizedHeaders,
      details: error instanceof Error ? error.stack : String(error)
    });

    if (!reply.sent) {
      reply
        .code(statusCode)
        .type('application/json; charset=utf-8')
        .header('Cache-Control', 'no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Security-Policy', "default-src 'none'")
        .header('X-Frame-Options', 'DENY')
        .header('Referrer-Policy', 'no-referrer')
        .send({
          statusCode,
          error: sanitizedErrorMessage,
          message: sanitizedErrorMessage
        });
    }
  });

  const app: NestFastifyApplication = await NestFactory.create(AppModule, adapter, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error']
        : ['debug', 'log', 'warn', 'error']
  });

  await server.register(fastifyCookie);
  await server.register(fmp);
  await server.register(session, {
    secret: randomBytes(32).toString('hex').slice(0, 32),
    cookieName: 'connect.sid',
    cookie: {
      secure: false,
      httpOnly: false
    }
  });
  server.addContentTypeParser('*', (req) => rawbody(req.raw));

  const httpAdapter = app.getHttpAdapter();

  app
    .useGlobalInterceptors(new HeadersConfiguratorInterceptor())
    .useGlobalFilters(new GlobalExceptionFilter(httpAdapter));

  const options = new DocumentBuilder()
    .setTitle('Pure Flow')
    .setDescription(
      `
  ![BC logo](/assets/img/logo_blue_small.png)

  This is the _Pure Flow_ REST API.

  _Pure Flow_ is a benchmark application that uses modern technologies and implements a set of common security vulnerabilities.

  ## Available endpoints

  * [App](#/App%20controller) - common operations

  * [Auth](#/Auth%20controller) - operations with authentication methods

  * [User](#/User%20controller) - operations with users(creation, searching)

  * [Files](#/Files%20controller) - operations with files

  * [Subscriptions](#/Subscriptions%20controller) - operations with subscriptions

  * [Testimonials](#/Testimonials%20controller) - operations with testimonials

  * [Products](#/Products%20controller) — operations with products

  * [Partners](#/Partners%20controller) — operations with partners

  * [Emails](#/Emails%20controller) — operations with emails
  
  * [Chat](#/Chat%20controller) — operations with chat


  `
    )
    .setVersion('1.0')
    .addServer(process.env.URL)
    .build();
  const document = SwaggerModule.createDocument(app, options);

  SwaggerModule.setup('swagger', app, document);

  await app.listen(3000, '0.0.0.0');
}

if (cluster.isPrimary && process.env.NODE_ENV === 'production') {
  console.log(`Primary ${process.pid} is running`);

  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(
      `Worker ${worker.process.pid} died with code ${code} and signal ${signal}`
    );
    console.log('Starting a new worker');
    cluster.fork();
  });
} else {
  bootstrap();
  console.log(`Worker ${process.pid} started`);
}
