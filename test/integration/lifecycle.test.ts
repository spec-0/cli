/**
 * Staging integration: team-scoped CLI lifecycle journey (pre-seeded team).
 *
 * Pushes a per-run-unique API into a pre-seeded team → creates a mock →
 * exercises the CLI's read/write surface → deletes the API + mock.
 *
 * The team is NOT created or deleted: `createTeam` reassigns the acting user
 * into the new team (single-team-per-user model), and team-scoped writes need a
 * real user principal (a SAT — a legacy org key 500s). So the team is seeded
 * once (name from `SPEC0_SMOKE_TEAM`, default `cli-smoke`) and reused.
 *
 * Requires a SAT in `SPEC0_TOKEN` with write:apis / write:specs / write:mocks.
 * Skipped automatically when staging env vars are missing (see staging-env.ts).
 * The default `npm test` excludes `test/integration/`; runs only via
 * `npm run test:integration` or the `staging-integration.yml` workflow.
 *
 * Coverage in order of execution:
 *   - team verify        (listTeams; the team must already exist — never created)
 *   - spec0 push --team  (publishes a team-scoped API)
 *   - spec0 status       (org overview reflects the new resources)
 *   - spec0 api list     (catalogue lists the new API)
 *   - spec0 mock create  (provisions mock for the API)
 *   - spec0 mock list    (sees the new mock)
 *   - spec0 mock show    (finds it by slug)
 *   - spec0 mock url     (single-line URL)
 *   - spec0 push v2      (publishes a second version)
 *   - spec0 api changelog v1 → v2  (structured diff between versions)
 *   - spec0 api show     (details — lean V1 fallback for the team SAT)
 *   - spec0 mock refresh (rebuilds against a newer spec; id and URL unchanged)
 *   - spec0 mock delete  (CLI-driven teardown; mock disappears from list)
 *   - spec0 api delete   (CLI-driven teardown; API disappears from list)
 *
 * `api show` prefers the rich internal `/apis/{id}/summary`, which a team SAT
 * isn't entitled to (403); it then falls back to the leaner V1 team-API row,
 * so it still returns the core metadata for the SAT used here.
 *
 * Cleanup: steps 11–12 delete the mock + API via the CLI; afterAll is a
 * best-effort SDK safety net for them if a step failed first. The pre-seeded
 * team is left intact. Per-run unique API/mock slugs (`Date.now()`) so re-runs
 * don't collide; each cleanup step swallows errors so a mid-test failure
 * doesn't mask the original.
 */
import {
  OpenAPI,
  PublicApisService,
  PublicMocksService,
  PublicTeamsService,
} from "@spec0/sdk-public-platform";
import { runCli } from "./runCli";
import { stagingEnv, stagingEnvAsRecord, STAGING_ENV_AVAILABLE } from "./staging-env";

const MINIMAL_SPEC_V1 = `openapi: 3.0.3
info:
  title: CLI Lifecycle Integration
  version: 0.1.0
  description: Throw-away spec used by the @spec0/cli lifecycle integration test.
paths:
  /ping:
    get:
      summary: Liveness probe
      operationId: getPing
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
`;

const MINIMAL_SPEC_V2 = `openapi: 3.0.3
info:
  title: CLI Lifecycle Integration
  version: 0.2.0
  description: Throw-away spec used by the @spec0/cli lifecycle integration test (v2).
paths:
  /ping:
    get:
      summary: Liveness probe
      operationId: getPing
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok:
                    type: boolean
                  buildId:
                    type: string
`;

interface MockListJsonRow {
  api: string;
  name: string;
  mockUrl: string;
}

interface MockCreateJsonOutput {
  apiId?: string;
  apiName?: string;
  mockUrl: string;
  apiKey?: string | null;
  created?: boolean;
}

interface MockShowJsonOutput {
  apiId?: string;
  apiName?: string;
  mockServerId?: string;
  name?: string;
  mockUrl: string;
}

interface ApiListJsonRow {
  apiId?: string;
  apiName?: string;
  version?: string | null;
  teamName?: string | null;
}

interface PushJsonOutput {
  apiId?: string;
  apiName?: string;
  version?: string;
  teamName?: string | null;
  created?: boolean;
  versionCreated?: boolean;
}

function configureSdkForStaging(): void {
  // Mirrors `configureSdkAuth` in src/lib/api-client.ts — same path that the
  // CLI sets up for its own SDK calls. The host root, no path suffix.
  OpenAPI.BASE = stagingEnv.apiUrl;
  OpenAPI.TOKEN = stagingEnv.token;
  OpenAPI.HEADERS = { "X-Org-Id": stagingEnv.orgId };
}

const describeFn = STAGING_ENV_AVAILABLE ? describe : describe.skip;

describeFn("staging integration: team-scoped CLI lifecycle (pre-seeded team)", () => {
  // API + mock are per-run unique (Date.now()). The team is pre-seeded and
  // shared — we never create or delete it: createTeam reassigns the acting
  // user into the new team (single-team-per-user model), which is wrong for a
  // recurring service-credential run, and team-scoped writes need a real user
  // principal (a SAT, not a legacy org key).
  const stamp = Date.now();
  // `||` (not `??`) so an empty SPEC0_SMOKE_TEAM (CI passes "" when the var is
  // unset) still falls back to the default rather than searching for team "".
  const teamSlug = process.env.SPEC0_SMOKE_TEAM || "cli-smoke";
  const apiSlug = `cli-lc-api-${stamp}`;

  let apiId: string | undefined;
  let mockServerId: string | undefined;

  // Write the v1 spec to a tmp file so `spec0 push <path>` resolves a real
  // file. Reused for both v1 and v2 (overwritten between steps).
  let specPath: string;

  beforeAll(async () => {
    configureSdkForStaging();

    // The smoke team must already exist in the test org. We do NOT create it
    // (see the side-effect note above) — fail with a clear setup message if
    // it's absent.
    const teams = await PublicTeamsService.listTeams();
    const found = teams.some((t) => (t.name ?? "").toLowerCase() === teamSlug.toLowerCase());
    if (!found) {
      throw new Error(
        `Smoke team '${teamSlug}' not found in the test org. Seed it once, or set ` +
          `SPEC0_SMOKE_TEAM to an existing team name.`,
      );
    }

    // Stage the v1 spec on disk for `spec0 push`.
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), `spec0-cli-lifecycle-${stamp}-`));
    specPath = join(dir, `${apiSlug}.yaml`);
    writeFileSync(specPath, MINIMAL_SPEC_V1, "utf-8");
  }, 30_000);

  afterAll(async () => {
    configureSdkForStaging();
    // Reverse-order cleanup: mock → api. The team is pre-seeded — never deleted.
    // Steps 11/12 normally delete these via the CLI and clear the ids; this is
    // a best-effort SDK safety net if a step failed before its CLI delete ran.
    if (mockServerId) {
      try {
        await PublicMocksService.deletePublicMock({ mockServerId });
      } catch (err) {
        console.warn(`[cleanup] deleteMock failed: ${(err as Error).message}`);
      }
    }
    if (apiId) {
      try {
        await PublicApisService.deleteTeamApi({ apiId });
      } catch (err) {
        console.warn(`[cleanup] deleteTeamApi failed: ${(err as Error).message}`);
      }
    }
  }, 30_000);

  it("step 1 — spec0 push creates the team-scoped API", () => {
    // Pass an explicit per-run git-sha. CI auto-detects HEAD as the same SHA
    // for every step, which would trip the backend's SHA-idempotency check on
    // the v2 push. We give v1 and v2 distinct fake SHAs so both go through.
    const v1Sha = `${stamp.toString(16)}aa00000000000000000000000000000000`.slice(0, 40);
    const r = runCli(
      [
        "push",
        specPath,
        "--name",
        apiSlug,
        "--team",
        teamSlug,
        "--git-sha",
        v1Sha,
        "--skip-lint",
        "--format",
        "json",
      ],
      { env: stagingEnvAsRecord() },
    );

    if (r.status !== 0) {
      console.error(`[push v1] stdout:\n${r.stdout}\n[push v1] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    const out = JSON.parse(r.stdout) as PushJsonOutput;
    expect(out.apiName).toBe(apiSlug);
    expect(out.created).toBe(true);
    expect(out.versionCreated).toBe(true);
    expect(typeof out.apiId).toBe("string");
    apiId = out.apiId;
  }, 60_000);

  it("step 2 — spec0 status reflects the new API", () => {
    const r = runCli(["status", "--output", "json"], { env: stagingEnvAsRecord() });
    if (r.status !== 0) {
      console.error(`[status] stdout:\n${r.stdout}\n[status] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    const out = JSON.parse(r.stdout) as { apiCount?: number; teamCount?: number };
    expect(typeof out.apiCount).toBe("number");
    expect((out.apiCount ?? 0) >= 1).toBe(true);
  }, 30_000);

  it("step 3 — spec0 api list finds the new API", () => {
    const r = runCli(["api", "list", "--output", "json"], { env: stagingEnvAsRecord() });
    if (r.status !== 0) {
      console.error(`[api list] stdout:\n${r.stdout}\n[api list] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    const parsed = JSON.parse(r.stdout) as ApiListJsonRow[] | { data?: ApiListJsonRow[] };
    const rows = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
    const hit = rows.find((r) => r.apiName === apiSlug);
    expect(hit).toBeDefined();
    expect(hit?.teamName).toBe(teamSlug);
  }, 30_000);

  it("step 4 — spec0 mock create provisions a mock", () => {
    const r = runCli(["mock", "create", "--api", apiSlug, "--output", "json"], {
      env: stagingEnvAsRecord(),
    });
    if (r.status !== 0) {
      console.error(`[mock create] stdout:\n${r.stdout}\n[mock create] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    const out = JSON.parse(r.stdout) as MockCreateJsonOutput;
    expect(out.mockUrl).toContain("/v2/mock-server/");
    expect(typeof out.created).toBe("boolean");
    // capture mockServerId for cleanup (parse from URL: /v2/mock-server/<uuid>)
    const m = /\/mock-server\/([0-9a-f-]+)/i.exec(out.mockUrl);
    if (m) mockServerId = m[1];
  }, 30_000);

  it("step 5 — spec0 mock list sees the new mock", () => {
    const r = runCli(["mock", "list", "--output", "json"], { env: stagingEnvAsRecord() });
    if (r.status !== 0) {
      console.error(`[mock list] stdout:\n${r.stdout}\n[mock list] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    const parsed = JSON.parse(r.stdout) as MockListJsonRow[] | { data?: MockListJsonRow[] };
    const rows = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
    const hit = rows.find((r) => r.api === apiSlug);
    expect(hit).toBeDefined();
    expect(hit?.mockUrl).toContain("/v2/mock-server/");
  }, 30_000);

  it("step 6 — spec0 mock show finds the mock by API slug", () => {
    const r = runCli(["mock", "show", apiSlug, "--output", "json"], {
      env: stagingEnvAsRecord(),
    });
    if (r.status !== 0) {
      console.error(`[mock show] stdout:\n${r.stdout}\n[mock show] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    const out = JSON.parse(r.stdout) as MockShowJsonOutput;
    expect(out.apiName).toBe(apiSlug);
    expect(out.mockUrl).toContain("/v2/mock-server/");
  }, 30_000);

  it("step 7 — spec0 mock url emits a single absolute URL", () => {
    const r = runCli(["mock", "url", apiSlug], { env: stagingEnvAsRecord() });
    if (r.status !== 0) {
      console.error(`[mock url] stdout:\n${r.stdout}\n[mock url] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    const url = r.stdout.trim();
    expect(url.split("\n").length).toBe(1);
    expect(url.startsWith(stagingEnv.apiUrl)).toBe(true);
    expect(url).toContain("/v2/mock-server/");
  }, 30_000);

  it("step 8 — spec0 push v2 publishes a second version", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(specPath, MINIMAL_SPEC_V2, "utf-8");

    // Distinct from step 1's git-sha so the backend doesn't short-circuit on
    // SHA idempotency.
    const v2Sha = `${stamp.toString(16)}bb00000000000000000000000000000000`.slice(0, 40);
    const r = runCli(
      [
        "push",
        specPath,
        "--name",
        apiSlug,
        "--team",
        teamSlug,
        "--version",
        "0.2.0",
        "--git-sha",
        v2Sha,
        "--skip-lint",
        "--format",
        "json",
      ],
      { env: stagingEnvAsRecord() },
    );
    if (r.status !== 0) {
      console.error(`[push v2] stdout:\n${r.stdout}\n[push v2] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    const out = JSON.parse(r.stdout) as PushJsonOutput;
    expect(out.apiName).toBe(apiSlug);
    expect(out.created).toBe(false); // existing API, just a new version
    expect(out.versionCreated).toBe(true);
    expect(out.version).toBe("0.2.0");
  }, 60_000);

  it("step 9 — spec0 mock refresh rebuilds against v2, keeping id and URL", () => {
    // Step 8 published a second version, so the mock is now answering the old
    // contract. This is the only point in the run where a refresh has anything
    // to do, which is what makes it worth asserting here rather than in
    // isolation.
    const before = runCli(["mock", "url", apiSlug], { env: stagingEnvAsRecord() });
    expect(before.status).toBe(0);

    const r = runCli(["mock", "refresh", apiSlug, "--output", "json"], {
      env: stagingEnvAsRecord(),
    });
    if (r.status !== 0) {
      console.error(`[mock refresh] stdout:\n${r.stdout}\n[mock refresh] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    const out = JSON.parse(r.stdout) as {
      mockServerId: string;
      refreshed: boolean;
      specVersion: string | null;
    };
    expect(out.refreshed).toBe(true);
    expect(out.specVersion).toBe("0.2.0");

    // The promise the command makes: whatever was pointing at this mock still
    // works afterwards.
    const after = runCli(["mock", "url", apiSlug], { env: stagingEnvAsRecord() });
    expect(after.status).toBe(0);
    expect(after.stdout.trim()).toBe(before.stdout.trim());

    // Running it again is a no-op rather than a second rebuild.
    const again = runCli(["mock", "refresh", apiSlug, "--output", "json"], {
      env: stagingEnvAsRecord(),
    });
    expect(again.status).toBe(0);
    expect((JSON.parse(again.stdout) as { refreshed: boolean }).refreshed).toBe(false);
  }, 60_000);

  it("step 10 — spec0 api changelog 0.1.0 → 0.2.0 returns a structured diff", () => {
    const r = runCli(
      ["api", "changelog", apiSlug, "--from", "0.1.0", "--to", "0.2.0", "--output", "json"],
      { env: stagingEnvAsRecord() },
    );
    if (r.status !== 0) {
      console.error(`[api changelog] stdout:\n${r.stdout}\n[api changelog] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    const out = JSON.parse(r.stdout) as { fromTag: string; toTag: string; changes: unknown[] };
    expect(out.fromTag).toBe("0.1.0");
    expect(out.toTag).toBe("0.2.0");
    expect(Array.isArray(out.changes)).toBe(true);
  }, 30_000);

  it("step 11 — spec0 api show returns details for the API", () => {
    const r = runCli(["api", "show", apiSlug, "--output", "json"], { env: stagingEnvAsRecord() });
    if (r.status !== 0) {
      console.error(`[api show] stdout:\n${r.stdout}\n[api show] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);

    // A team SAT can't read the internal summary (403) → api show falls back to
    // the lean V1 row, which still carries id / name / version / team.
    const out = JSON.parse(r.stdout) as { apiId?: string; apiName?: string; teamName?: string };
    expect(out.apiId).toBe(apiId);
    expect(out.apiName).toBe(apiSlug);
    expect(out.teamName).toBe(teamSlug);
  }, 30_000);

  it("step 12 — spec0 mock delete removes the mock (CLI-driven teardown)", () => {
    const r = runCli(["mock", "delete", apiSlug, "--yes"], { env: stagingEnvAsRecord() });
    if (r.status !== 0) {
      console.error(`[mock delete] stdout:\n${r.stdout}\n[mock delete] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);
    // CLI handled teardown — clear so afterAll's SDK safety-net doesn't double-delete.
    mockServerId = undefined;

    const list = runCli(["mock", "list", "--output", "json"], { env: stagingEnvAsRecord() });
    expect(list.status).toBe(0);
    const parsed = JSON.parse(list.stdout) as MockListJsonRow[] | { data?: MockListJsonRow[] };
    const rows = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
    expect(rows.find((row) => row.api === apiSlug)).toBeUndefined();
  }, 30_000);

  it("step 13 — spec0 api delete removes the API (CLI-driven teardown)", () => {
    const r = runCli(["api", "delete", apiSlug, "--yes"], { env: stagingEnvAsRecord() });
    if (r.status !== 0) {
      console.error(`[api delete] stdout:\n${r.stdout}\n[api delete] stderr:\n${r.stderr}`);
    }
    expect(r.status).toBe(0);
    apiId = undefined;

    const list = runCli(["api", "list", "--output", "json"], { env: stagingEnvAsRecord() });
    expect(list.status).toBe(0);
    const parsed = JSON.parse(list.stdout) as ApiListJsonRow[] | { data?: ApiListJsonRow[] };
    const rows = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
    expect(rows.find((row) => row.apiName === apiSlug)).toBeUndefined();
  }, 30_000);
});
