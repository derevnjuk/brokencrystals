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

test('POST /api/testimonials', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['sqli', 'stored_xss', 'jwt', 'bopla'],
      attackParamLocations: [AttackParamLocation.BODY, AttackParamLocation.HEADER],
      starMetadata: {
        databases: ['PostgreSQL'],
        user_roles: [
          'default-roles-pureflow',
          'realm-admin',
          'offline_access',
          'uma_authorization',
          'query-users',
          'view-authorization',
          'create-client',
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
      url: `${baseUrl}/api/testimonials`,
      body: {
        name: 'John',
        title: 'Doe',
        message: "I've broken all the crystals"
      },
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer <JWT_TOKEN>'
      },
      auth: process.env.BRIGHT_AUTH_ID
    });
});