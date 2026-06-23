const express = require('express');
require('reflect-metadata');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

function setPlain(res) {
  res.type('text/plain');
}

function safeLoad(name, loader) {
  try {
    const value = loader();
    console.log(`[harness] loaded ${name}`);
    return value;
  } catch (err) {
    console.warn(
      `[harness] failed to load ${name}: ${err && err.stack ? err.stack : err}`
    );
    return null;
  }
}

function promisifyMaybe(value) {
  return Promise.resolve(value);
}

async function streamToString(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function getParam(req, name) {
  if (req.query && req.query[name] !== undefined) return req.query[name];
  if (req.body && req.body[name] !== undefined) return req.body[name];
  return undefined;
}

app.get('/health', (req, res) => {
  setPlain(res);
  res.status(200).send('ok');
});

const fileServiceModule = safeLoad('FileService', () => {
  const { FileService } = require('./src/file/file.service');
  return { FileService };
});

if (fileServiceModule) {
  app.get('/harness/fileservice-getfile', async (req, res) => {
    setPlain(res);
    try {
      const svc = new fileServiceModule.FileService();
      const file = String(getParam(req, 'file') ?? '');
      const result = await svc.getFile(file);
      if (result && typeof result.on === 'function') {
        const text = await streamToString(result);
        res.status(200).send(text);
      } else {
        res.status(200).send(String(result));
      }
    } catch (err) {
      res.status(500).send(err && err.message ? err.message : String(err));
    }
  });

  app.delete('/harness/fileservice-deletefile', async (req, res) => {
    setPlain(res);
    try {
      const svc = new fileServiceModule.FileService();
      const file = String(getParam(req, 'file') ?? '');
      const result = await svc.deleteFile(file);
      res.status(200).send(String(result));
    } catch (err) {
      res.status(500).send(err && err.message ? err.message : String(err));
    }
  });
}

const partnersServiceModule = safeLoad('PartnersService', () => {
  const { PartnersService } = require('./src/partners/partners.service');
  return { PartnersService };
});

if (partnersServiceModule) {
  app.get('/harness/partnersservice-getpartnersproperties', async (req, res) => {
    setPlain(res);
    try {
      const svc = new partnersServiceModule.PartnersService();
      const xpathExpression = String(getParam(req, 'xpathExpression') ?? '');
      const result = await promisifyMaybe(svc.getPartnersProperties(xpathExpression));
      res.status(200).send(typeof result === 'string' ? result : JSON.stringify(result));
    } catch (err) {
      res.status(500).send(err && err.message ? err.message : String(err));
    }
  });
}

const emailServiceModule = safeLoad('EmailService', () => {
  const { EmailService } = require('./src/email/email.service');
  return { EmailService };
});

if (emailServiceModule) {
  app.get('/harness/emailservice-createmailoptionsforemailinjetion', async (req, res) => {
    setPlain(res);
    try {
      const svc = new emailServiceModule.EmailService();
      const from = String(getParam(req, 'from') ?? '');
      const to = String(getParam(req, 'to') ?? '');
      const subject = String(getParam(req, 'subject') ?? '');
      const body = String(getParam(req, 'body') ?? '');
      const result = svc.createMailOptionsForEmailInjetion(from, to, subject, body);
      res.status(200).send(JSON.stringify(result));
    } catch (err) {
      res.status(500).send(err && err.message ? err.message : String(err));
    }
  });
}

const ldapQueryHandlerModule = safeLoad('LdapQueryHandler', () => {
  const { LdapQueryHandler } = require('./src/users/ldap.query.handler');
  return { LdapQueryHandler };
});

if (ldapQueryHandlerModule) {
  app.get('/harness/ldapqueryhandler-parsequery', async (req, res) => {
    setPlain(res);
    try {
      const handler = new ldapQueryHandlerModule.LdapQueryHandler();
      const query = String(getParam(req, 'query') ?? '');
      const result = await promisifyMaybe(handler.parseQuery(query));
      res.status(200).send(String(result));
    } catch (err) {
      res.status(500).send(err && err.message ? err.message : String(err));
    }
  });
}

const jwtJkuModule = safeLoad('JwtTokenWithJKUProcessor', () => {
  const { JwtTokenWithJKUProcessor } = require('./src/auth/jwt/jwt.token.with.jku.processor');
  const { HttpClientService } = require('./src/httpclient/httpclient.service');
  return { JwtTokenWithJKUProcessor, HttpClientService };
});

if (jwtJkuModule) {
  app.get('/harness/jwttokenwithjkuprocessor-validatetoken', async (req, res) => {
    setPlain(res);
    try {
      const token = String(getParam(req, 'token') ?? '');
      const processor = new jwtJkuModule.JwtTokenWithJKUProcessor(
        'dummy',
        new jwtJkuModule.HttpClientService(),
        'http://127.0.0.1/dummy-jku.json'
      );
      const result = await processor.validateToken(token);
      res.status(200).send(typeof result === 'string' ? result : JSON.stringify(result));
    } catch (err) {
      res.status(500).send(err && err.message ? err.message : String(err));
    }
  });
}

const jwtX5uModule = safeLoad('JwtTokenWithX5UKeyProcessor', () => {
  const { JwtTokenWithX5UKeyProcessor } = require('./src/auth/jwt/jwt.token.with.x5u.key.processor');
  const { HttpClientService } = require('./src/httpclient/httpclient.service');
  return { JwtTokenWithX5UKeyProcessor, HttpClientService };
});

if (jwtX5uModule) {
  app.get('/harness/jwttokenwithx5ukeyprocessor-validatetoken', async (req, res) => {
    setPlain(res);
    try {
      const token = String(getParam(req, 'token') ?? '');
      const processor = new jwtX5uModule.JwtTokenWithX5UKeyProcessor(
        'dummy',
        new jwtX5uModule.HttpClientService(),
        'http://127.0.0.1/dummy-cert.pem'
      );
      const result = await processor.validateToken(token);
      res.status(200).send(typeof result === 'string' ? result : JSON.stringify(result));
    } catch (err) {
      res.status(500).send(err && err.message ? err.message : String(err));
    }
  });
}

const jwtJwkModule = safeLoad('JwtTokenWithJWKProcessor', () => {
  const { JwtTokenWithJWKProcessor } = require('./src/auth/jwt/jwt.token.with.jwk.processor');
  return { JwtTokenWithJWKProcessor };
});

if (jwtJwkModule) {
  app.get('/harness/jwttokenwithjwkprocessor-validatetoken', async (req, res) => {
    setPlain(res);
    try {
      const token = String(getParam(req, 'token') ?? '');
      const processor = new jwtJwkModule.JwtTokenWithJWKProcessor('dummy', {});
      const result = await processor.validateToken(token);
      res.status(200).send(typeof result === 'string' ? result : JSON.stringify(result));
    } catch (err) {
      res.status(500).send(err && err.message ? err.message : String(err));
    }
  });
}

const jwtX5cModule = safeLoad('JwtTokenWithX5CKeyProcessor', () => {
  const { JwtTokenWithX5CKeyProcessor } = require('./src/auth/jwt/jwt.token.with.x5c.key.processor');
  return { JwtTokenWithX5CKeyProcessor };
});

if (jwtX5cModule) {
  app.get('/harness/jwttokenwithx5ckeyprocessor-validatetoken', async (req, res) => {
    setPlain(res);
    try {
      const token = String(getParam(req, 'token') ?? '');
      const processor = new jwtX5cModule.JwtTokenWithX5CKeyProcessor('dummy');
      const result = await processor.validateToken(token);
      res.status(200).send(typeof result === 'string' ? result : JSON.stringify(result));
    } catch (err) {
      res.status(500).send(err && err.message ? err.message : String(err));
    }
  });
}

app.listen(PORT, () => {
  console.log(`[harness] listening on port ${PORT}`);
});
