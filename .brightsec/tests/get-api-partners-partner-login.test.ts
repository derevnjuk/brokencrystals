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

test('GET /api/partners/partnerLogin', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['xpathi'],
      attackParamLocations: [AttackParamLocation.QUERY],
      starMetadata: {
        code_source: 'derevnjuk/pureflow:stable',
        databases: ['PostgreSQL'],
        user_roles: {
          roles: ['default-roles-pureflow', 'realm-admin']
        }
      }
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.GET,
      url: `${baseUrl}/api/partners/partnerLogin?username=walter100&password=Heisenberg123`,
      headers: { 'Content-Type': 'text/xml' }
    });
});
