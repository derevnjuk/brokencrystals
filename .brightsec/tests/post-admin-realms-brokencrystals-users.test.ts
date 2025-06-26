import { test, before, after } from 'node:test';
import { SecRunner } from '@sectester/runner';
import { Severity, AttackParamLocation, HttpMethod } from '@sectester/scan';

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

test('POST /admin/realms/brokencrystals/users', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['bopla', 'csrf', 'sqli', 'xss', 'secret_tokens'],
      attackParamLocations: [AttackParamLocation.BODY, AttackParamLocation.HEADER]
    })
    .threshold(Severity.CRITICAL)
    .timeout(timeout)
    .run({
      method: HttpMethod.POST,
      url: `${baseUrl}/admin/realms/brokencrystals/users`,
      body: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        enabled: true,
        username: 'john.doe@example.com',
        credentials: [{
          type: 'password',
          value: 'securePassword123',
          temporary: false
        }]
      },
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer exampleAccessToken'
      },
      auth: process.env.BRIGHT_AUTH_ID
    });
});
