import { test, before, after } from 'node:test';
import { SecRunner } from '@sectester/runner';
import { AttackParamLocation, HttpMethod } from '@sectester/scan';

const timeout = 40 * 60 * 1000;
const baseUrl = process.env.BRIGHT_TARGET_URL!;

let runner!: SecRunner;

before(async () => {
  runner = new SecRunner({
    hostname: process.env.BRIGHT_HOSTNAME!,
    projectId: process.env.BRIGHT_PROJECT_ID!
  });

  await runner.init();
});

after(() => runner.clear());

test('POST /api/users/basic', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['bopla', 'ldapi', 'sqli', 'xss', 'secret_tokens'],
      attackParamLocations: [AttackParamLocation.BODY],
      starMetadata: {
        databases: ['PostgreSQL'],
        user_roles: [
          'default-roles-pureflow',
          'offline_access',
          'uma_authorization',
          'query-users',
          'view-authorization',
          'create-client',
          'realm-admin',
          'manage-users',
          'manage-authorization',
          'query-realms',
          'view-events',
          'manage-clients',
          'view-realm',
          'manage-realm',
          'impersonation',
          'query-clients',
          'query-groups',
          'manage-events',
          'view-clients',
          'view-identity-providers',
          'view-users',
          'manage-identity-providers',
          'read-token',
          'view-profile',
          'manage-account-links',
          'manage-account',
          'manage-consent',
          'view-applications',
          'view-consent',
          'delete-account'
        ]
      }
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.POST,
      url: `${baseUrl}/api/users/basic`,
      body: {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Dull Security',
        id: 1,
        cardNumber: '4263982640269299',
        phoneNumber: '12065550100',
        password: 'Pa55w0rd',
        op: 'basic'
      },
      headers: { 'Content-Type': 'application/json' },
      auth: process.env.BRIGHT_AUTH_ID
    });
});