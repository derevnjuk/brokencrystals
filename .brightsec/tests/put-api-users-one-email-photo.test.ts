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

test('PUT /api/users/one/:email/photo', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['file_upload', 'xss', 'xxe', 'bopla', 'jwt'],
      attackParamLocations: [AttackParamLocation.BODY, AttackParamLocation.HEADER]
    })
    .threshold(Severity.CRITICAL)
    .timeout(timeout)
    .run({
      method: HttpMethod.PUT,
      url: `${baseUrl}/api/users/one/john.doe@example.com/photo`,
      body: {
        company: 'Example Corp',
        cardNumber: '1234-5678-9012-3456',
        phoneNumber: '+1234567890',
        password: 'securePassword123',
        op: 'basic'
      },
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer <JWT_TOKEN>' },
      auth: process.env.BRIGHT_AUTH_ID
    });
});
