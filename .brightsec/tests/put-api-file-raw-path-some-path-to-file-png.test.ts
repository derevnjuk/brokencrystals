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

test('PUT /api/file/raw?path=some/path/to/file.png', { signal: AbortSignal.timeout(timeout) }, async () => {
  await runner
    .createScan({
      tests: ['file_upload', 'lfi', 'osi', 'full_path_disclosure'],
      attackParamLocations: [AttackParamLocation.QUERY, AttackParamLocation.BODY],
      starMetadata: {
        "user_roles": [
          "default-roles-brokencrystals",
          "offline_access",
          "uma_authorization",
          "query-users",
          "view-authorization",
          "create-client",
          "realm-admin",
          "manage-users",
          "manage-authorization",
          "query-realms",
          "view-events",
          "manage-clients",
          "view-realm",
          "manage-realm",
          "impersonation",
          "query-clients",
          "query-groups",
          "manage-events",
          "view-clients",
          "view-identity-providers",
          "view-users",
          "manage-identity-providers",
          "read-token",
          "view-profile",
          "manage-account-links",
          "manage-account",
          "manage-consent",
          "view-applications",
          "view-consent",
          "delete-account"
        ]
      }
    })
    .setFailFast(false)
    .timeout(timeout)
    .run({
      method: HttpMethod.PUT,
      url: `${baseUrl}/api/file/raw?path=some/path/to/file.png`,
      body: "This is a sample raw file content.",
      headers: { 'Content-Type': 'text/plain' },
      auth: process.env.BRIGHT_AUTH_ID
    });
});
