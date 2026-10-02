#!/usr/bin/env node
/**
 * spec0 CLI smoke tests — run against the compiled dist/index.js.
 *
 * Usage:
 *   npm run build && node scripts/smoke.mjs
 *   npm run test:smoke
 *
 * Requires: Node 20+, dist/ to be up to date.
 * Does NOT require authentication — all network calls are either skipped (lint) or expected to fail.
 */

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const bin = resolve(root, "dist", "index.js");
const validSpec = resolve(root, "test", "fixtures", "valid-spec.yaml");
const _invalidSpec = resolve(root, "test", "fixtures", "invalid-spec.yaml");

// ── Runner ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function run(args, { env, input } = {}) {
  return spawnSync("node", [bin, ...args], {
    encoding: "utf-8",
    cwd: root,
    env: { ...process.env, NO_COLOR: "1", ...env },
    input,
    timeout: 15000,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     → ${err.message}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n${name}`);
}

// ── Pre-flight ───────────────────────────────────────────────────────────────

if (!existsSync(bin)) {
  console.error(`\nError: ${bin} not found. Run 'npm run build' first.\n`);
  process.exit(1);
}

console.log(`\nSpec0 CLI smoke tests`);
console.log(`Binary: ${bin}\n`);

// ── Version / help ───────────────────────────────────────────────────────────

section("Version & Help");

test("--version exits 0 and prints a semver string", () => {
  const r = run(["--version"]);
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`);
  assert(/\d+\.\d+\.\d+/.test(r.stdout.trim()), `Not semver: ${r.stdout.trim()}`);
});

test("--help exits 0", () => {
  const r = run(["--help"]);
  assert(r.status === 0, `exit ${r.status}`);
});

test("--help mentions core commands", () => {
  const r = run(["--help"]);
  const out = r.stdout + r.stderr;
  for (const cmd of ["push", "publish", "lint", "mock", "team", "auth", "whoami"]) {
    assert(out.includes(cmd), `--help missing command: ${cmd}`);
  }
});

test("--help does NOT mention removed 'register' command", () => {
  const r = run(["--help"]);
  const out = r.stdout + r.stderr;
  assert(!out.includes("register"), `'register' still present in help output`);
});

// ── push ─────────────────────────────────────────────────────────────────────

section("spec0 push");

test("push --help exits 0", () => {
  const r = run(["push", "--help"]);
  assert(r.status === 0, `exit ${r.status}`);
});

test("push --help mentions --semver", () => {
  const r = run(["push", "--help"]);
  assert((r.stdout + r.stderr).includes("--semver"), "Missing --semver in push help");
});

test("push --help mentions --skip-lint", () => {
  const r = run(["push", "--help"]);
  assert((r.stdout + r.stderr).includes("--skip-lint"), "Missing --skip-lint in push help");
});

test("push with missing file exits 2 (USAGE)", () => {
  const r = run(["push", "nonexistent-spec.yaml"]);
  assert(r.status === 2, `Expected exit 2, got ${r.status}`);
});

test("push with missing file shows actionable error", () => {
  const r = run(["push", "nonexistent-spec.yaml"]);
  const out = r.stdout + r.stderr;
  assert(out.includes("not found") || out.includes("Spec file"), `Unexpected error: ${out}`);
});

test("push without auth exits 3 (AUTH_MISSING) and references SPEC0_TOKEN", () => {
  const r = run(["push", "--skip-lint", validSpec], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
  const out = r.stdout + r.stderr;
  assert(
    out.includes("SPEC0_TOKEN") || out.includes("auth login"),
    `Error should mention SPEC0_TOKEN or auth login. Got: ${out}`,
  );
});

test("push --dry-run with valid spec and SPEC0_TOKEN set exits 0", () => {
  const r = run(["push", "--skip-lint", "--dry-run", validSpec], {
    env: {
      SPEC0_TOKEN: "fake-token-for-dry-run",
      SPEC0_ORG_ID: "fake-org-id",
    },
  });
  assert(r.status === 0, `Expected exit 0, got ${r.status}\n${r.stderr}`);
});

test("push --dry-run output mentions the spec file name", () => {
  const r = run(["push", "--skip-lint", "--dry-run", validSpec], {
    env: { SPEC0_TOKEN: "tok", SPEC0_ORG_ID: "org" },
  });
  const out = r.stdout + r.stderr;
  assert(out.includes("valid-spec") || out.includes("dry"), `Unexpected output: ${out}`);
});

test("push --format json --dry-run exits 0", () => {
  const r = run(["push", "--skip-lint", "--dry-run", "--format", "json", validSpec], {
    env: { SPEC0_TOKEN: "tok", SPEC0_ORG_ID: "org" },
  });
  assert(r.status === 0, `exit ${r.status}\n${r.stderr}`);
});

// ── lint ─────────────────────────────────────────────────────────────────────

section("spec0 lint");

test("lint --help exits 0", () => {
  const r = run(["lint", "--help"]);
  assert(r.status === 0, `exit ${r.status}`);
});

test("lint valid spec exits 0", () => {
  const r = run(["lint", validSpec]);
  assert(r.status === 0, `exit ${r.status}\n${r.stderr}`);
});

test("lint valid spec shows score", () => {
  const r = run(["lint", validSpec]);
  const out = r.stdout + r.stderr;
  assert(out.includes("/100"), `No score in output: ${out}`);
});

test("lint --format json outputs valid JSON", () => {
  const r = run(["lint", "--format", "json", validSpec]);
  assert(r.status === 0, `exit ${r.status}\n${r.stderr}`);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Output is not valid JSON: ${r.stdout}`);
  }
  assert(typeof parsed.score === "number", "JSON output missing 'score'");
  assert(Array.isArray(parsed.errors), "JSON output missing 'errors'");
});

test("lint missing file exits 2 (USAGE)", () => {
  const r = run(["lint", "no-such-file.yaml"]);
  assert(r.status === 2, `Expected exit 2, got ${r.status}`);
});

test("lint below --min-score exits 7 (VALIDATION)", () => {
  const r = run(["lint", validSpec, "--min-score", "999"]);
  assert(r.status === 7, `Expected exit 7 (VALIDATION), got ${r.status}`);
});

// ── mock ─────────────────────────────────────────────────────────────────────

section("spec0 mock");

test("mock --help exits 0", () => {
  const r = run(["mock", "--help"]);
  assert(r.status === 0, `exit ${r.status}`);
});

test("mock --help shows only implemented subcommands", () => {
  const r = run(["mock", "--help"]);
  const out = r.stdout + r.stderr;
  assert(out.includes("create"), "mock create missing");
  assert(out.includes("list"), "mock list missing");
  assert(out.includes("show"), "mock show missing");
  assert(out.includes("url"), "mock url missing");
  assert(out.includes("delete"), "mock delete missing");
  assert(!out.includes("regenerate-key"), "'mock regenerate-key' stub should be removed");
  assert(!out.includes("logs"), "'mock logs' stub should be removed");
});

test("mock list without auth exits 3 (AUTH_MISSING)", () => {
  const r = run(["mock", "list"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
});

test("mock create without --api exits 2 (USAGE)", () => {
  const r = run(["mock", "create"], {
    env: { SPEC0_TOKEN: "tok", SPEC0_ORG_ID: "org" },
  });
  assert(r.status === 2, `Expected exit 2 (USAGE), got ${r.status}`);
});

test("mock create without auth exits 3 (AUTH_MISSING)", () => {
  const r = run(["mock", "create", "--api", "foo"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
});

test("mock show --help mentions --output", () => {
  const r = run(["mock", "show", "--help"]);
  assert((r.stdout + r.stderr).includes("--output"), "mock show missing --output");
});

test("mock show without auth exits 3 (AUTH_MISSING)", () => {
  const r = run(["mock", "show", "foo"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
});

// ── auth / whoami ─────────────────────────────────────────────────────────────

section("spec0 auth & whoami");

test("auth --help exits 0", () => {
  const r = run(["auth", "--help"]);
  assert(r.status === 0, `exit ${r.status}`);
});

test("auth status when not logged in exits 0 and shows guidance", () => {
  const r = run(["auth", "status"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 0, `Expected exit 0, got ${r.status}`);
  const out = r.stdout + r.stderr;
  assert(
    out.toLowerCase().includes("not logged in") || out.includes("auth login"),
    `Unexpected output: ${out}`,
  );
});

test("whoami when not logged in exits 0 and shows guidance", () => {
  const r = run(["whoami"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 0, `Expected exit 0, got ${r.status}`);
  const out = r.stdout + r.stderr;
  assert(
    out.toLowerCase().includes("not logged in") || out.includes("auth login"),
    `Unexpected output: ${out}`,
  );
});

test("auth status mentions SPEC0_TOKEN env var for CI guidance", () => {
  const r = run(["auth", "status"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  const out = r.stdout + r.stderr;
  assert(out.includes("SPEC0_TOKEN"), `Expected SPEC0_TOKEN mention. Got: ${out}`);
});

// ── SPEC0_* env var wiring ────────────────────────────────────────────────────

section("SPEC0_* environment variables");

test("SPEC0_TOKEN recognized — reaches the network step (not the local no-creds gate)", () => {
  const r = run(["push", "--skip-lint", validSpec], {
    env: {
      SPEC0_TOKEN: "fake-token",
      SPEC0_ORG_ID: "fake-org",
      // Pin the API base to a host that is guaranteed never to resolve — RFC 6761 reserves the
      // `.invalid` TLD, so this fails to connect on every runner regardless of network egress.
      // The push therefore deterministically dies at the network call instead of reaching a live
      // backend, which proves the env token was recognized and used to get that far — without
      // depending on a real server's 401 (or on the default host happening to be unreachable).
      SPEC0_API_URL: "http://push-smoke.invalid",
    },
  });
  const out = r.stdout + r.stderr;
  // Must skip the local "Not authenticated / set SPEC0_TOKEN" no-creds gate (token was recognized)…
  assert(!out.includes("Not authenticated"), `Should not hit the local no-creds gate: ${out}`);
  // …and fail at the network call against the configured host — a connection error, never an auth
  // rejection, since the request can never reach a server.
  assert(
    out.includes("Push failed"),
    `Should attempt the push against the configured host: ${out}`,
  );
});

// ── api group ─────────────────────────────────────────────────────────────────

section("spec0 api");

test("api --help exits 0", () => {
  const r = run(["api", "--help"]);
  assert(r.status === 0, `exit ${r.status}`);
});

test("api --help shows list, show, and delete subcommands", () => {
  const r = run(["api", "--help"]);
  const out = r.stdout + r.stderr;
  assert(out.includes("list"), "api list missing from --help");
  assert(out.includes("show"), "api show missing from --help");
  assert(out.includes("delete"), "api delete missing from --help");
});

test("api list --help mentions --output", () => {
  const r = run(["api", "list", "--help"]);
  assert((r.stdout + r.stderr).includes("--output"), "api list missing --output flag");
});

test("api list without auth exits 3 (AUTH_MISSING)", () => {
  const r = run(["api", "list"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
});

test("api show without ref exits non-zero (commander missing argument)", () => {
  const r = run(["api", "show"], {
    env: { SPEC0_TOKEN: "tok", SPEC0_ORG_ID: "org" },
  });
  assert(r.status !== 0, `Expected non-zero exit, got ${r.status}`);
});

test("api changelog --help mentions --from and --to", () => {
  const r = run(["api", "changelog", "--help"]);
  const out = r.stdout + r.stderr;
  assert(out.includes("--from"), "api changelog missing --from");
  assert(out.includes("--to"), "api changelog missing --to");
});

test("api changelog without auth exits 3 (AUTH_MISSING)", () => {
  const r = run(["api", "changelog", "acme/orders"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
});

// ── doctor ────────────────────────────────────────────────────────────────────

section("spec0 doctor");

test("doctor --help exits 0", () => {
  const r = run(["doctor", "--help"]);
  assert(r.status === 0, `exit ${r.status}`);
});

test("doctor without auth exits 3 and lists missing token + orgId", () => {
  const r = run(["doctor"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
  const out = r.stdout + r.stderr;
  assert(out.includes("token"), "doctor output missing 'token'");
  assert(out.includes("not set"), "doctor output missing '(not set)' marker");
});

test("doctor --output=json emits valid JSON with settings array", () => {
  const r = run(["doctor", "--output=json"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Invalid JSON: ${r.stdout}`);
  }
  assert(Array.isArray(parsed.settings), "settings missing or not an array");
  assert(parsed.ok === false, "ok should be false when token is missing");
});

// ── sync-status ───────────────────────────────────────────────────────────────

section("spec0 sync-status");

test("sync-status --help exits 0", () => {
  const r = run(["sync-status", "--help"]);
  assert(r.status === 0, `exit ${r.status}`);
});

test("sync-status --help mentions --git-sha", () => {
  const r = run(["sync-status", "--help"]);
  assert((r.stdout + r.stderr).includes("--git-sha"), "sync-status missing --git-sha");
});

test("sync-status without auth exits 3 (AUTH_MISSING)", () => {
  const r = run(["sync-status", "acme/orders"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
});

test("sync-status without ref or --api exits 2 (USAGE)", () => {
  const r = run(["sync-status", "--git-sha", "abc123"], {
    env: { SPEC0_TOKEN: "tok", SPEC0_ORG_ID: "org" },
  });
  assert(r.status === 2, `Expected exit 2 (USAGE), got ${r.status}`);
});

// ── auth typed-exit retrofit ─────────────────────────────────────────────────

section("spec0 auth typed exits");

test("auth token with no creds exits 3 (AUTH_MISSING)", () => {
  const r = run(["auth", "token"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
});

// ── diff / search / init / mcp typed-exit retrofit ───────────────────────────

section("spec0 diff / search / init / mcp");

test("diff without auth exits 3 (AUTH_MISSING)", () => {
  const r = run(["diff", "a.yaml", "b.yaml"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
});

test("search without auth exits 3 (AUTH_MISSING)", () => {
  const r = run(["search", "query"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
});

test("mcp url works without CLI auth (client does OAuth at connect time)", () => {
  const r = run(["mcp", "url"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 0, `Expected exit 0, got ${r.status}`);
  const out = r.stdout + r.stderr;
  assert(out.includes("/mcp"), `Expected the MCP URL in output. Got: ${out}`);
});

// ── ci generate ───────────────────────────────────────────────────────────────

section("spec0 ci generate");

test("ci --help exits 0 and shows generate subcommand", () => {
  const r = run(["ci", "--help"]);
  assert(r.status === 0, `exit ${r.status}`);
  assert((r.stdout + r.stderr).includes("generate"), "ci help missing 'generate'");
});

test("ci generate with unknown provider exits 2 (USAGE)", () => {
  const r = run(["ci", "generate", "gitlab"], {
    env: { SPEC0_TOKEN: "tok", SPEC0_ORG_ID: "org" },
  });
  assert(r.status === 2, `Expected exit 2 (USAGE), got ${r.status}`);
});

test("ci generate github without auth exits 3 (AUTH_MISSING)", () => {
  const r = run(["ci", "generate", "github"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
});

// ── lint --save-ruleset ───────────────────────────────────────────────────────

test("lint --help mentions --save-ruleset", () => {
  const r = run(["lint", "--help"]);
  assert((r.stdout + r.stderr).includes("--save-ruleset"), "lint missing --save-ruleset");
});

test("lint --save-ruleset with missing file exits 2 (USAGE)", () => {
  const r = run(["lint", "--save-ruleset", "no-such-ruleset.yaml"], {
    env: { SPEC0_TOKEN: "tok", SPEC0_ORG_ID: "org" },
  });
  assert(r.status === 2, `Expected exit 2, got ${r.status}`);
});

// ── commands (agent-discovery) ────────────────────────────────────────────────

section("spec0 commands");

test("commands --help exits 0", () => {
  const r = run(["commands", "--help"]);
  assert(r.status === 0, `exit ${r.status}`);
});

test("commands exits 0 and lists multiple commands", () => {
  const r = run(["commands"]);
  assert(r.status === 0, `exit ${r.status}`);
  const out = r.stdout + r.stderr;
  // Sanity: at least a handful of known commands should appear.
  for (const cmd of ["publish", "mock create", "doctor", "api list"]) {
    assert(out.includes(cmd), `commands output missing '${cmd}'`);
  }
});

test("commands --output=json emits valid capability manifest", () => {
  const r = run(["commands", "--output=json"]);
  assert(r.status === 0, `exit ${r.status}`);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Invalid JSON: ${r.stdout.slice(0, 200)}`);
  }
  assert(typeof parsed.version === "string", "manifest missing 'version'");
  assert(Array.isArray(parsed.commands), "manifest 'commands' not an array");
  assert(parsed.commands.length > 10, `expected >10 commands, got ${parsed.commands.length}`);
  assert(typeof parsed.exitCodes === "object", "manifest missing 'exitCodes'");
  assert(parsed.exitCodes["3"] !== undefined, "exit code 3 missing from table");
  // Spot-check a command entry has the expected shape.
  const publish = parsed.commands.find((c) => c.name === "publish");
  assert(publish, "'publish' missing from manifest");
  assert(Array.isArray(publish.flags), "publish.flags not an array");
});

test("commands <pattern> filters by substring", () => {
  const r = run(["commands", "mock", "--output=json"]);
  assert(r.status === 0, `exit ${r.status}`);
  const parsed = JSON.parse(r.stdout);
  assert(parsed.commands.length >= 3, `expected >=3 mock commands, got ${parsed.commands.length}`);
  for (const c of parsed.commands) {
    assert(c.name.toLowerCase().includes("mock"), `non-matching command '${c.name}' in filter`);
  }
});

// ── structured error payloads (for AI agents) ────────────────────────────────

section("structured errors in --output=json");

function parseErrorJson(stdout, cmd) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`[${cmd}] expected JSON error on stdout, got: ${stdout.slice(0, 200)}`);
  }
}

test("api list --output=json on auth failure emits {error:{code:AUTH_MISSING}}", () => {
  const r = run(["api", "list", "--output=json"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
  const parsed = parseErrorJson(r.stdout, "api list");
  assert(parsed.error, "missing .error field");
  assert(
    parsed.error.code === "AUTH_MISSING",
    `expected code=AUTH_MISSING, got ${parsed.error.code}`,
  );
  assert(typeof parsed.error.message === "string", "missing .error.message");
  assert(typeof parsed.error.hint === "string", "missing .error.hint");
});

test("sync-status --output=json USAGE error emits structured payload", () => {
  const r = run(["sync-status", "--git-sha", "abc", "--output=json"], {
    env: { SPEC0_TOKEN: "tok", SPEC0_ORG_ID: "org" },
  });
  assert(r.status === 2, `Expected exit 2 (USAGE), got ${r.status}`);
  const parsed = parseErrorJson(r.stdout, "sync-status");
  assert(parsed.error.code === "USAGE", `expected code=USAGE, got ${parsed.error.code}`);
});

test("ci generate gitlab --output=json emits USAGE error with hint", () => {
  const r = run(["ci", "generate", "gitlab", "--output=json"], {
    env: { SPEC0_TOKEN: "tok", SPEC0_ORG_ID: "org" },
  });
  assert(r.status === 2, `Expected exit 2 (USAGE), got ${r.status}`);
  const parsed = parseErrorJson(r.stdout, "ci generate");
  assert(parsed.error.code === "USAGE", `expected code=USAGE, got ${parsed.error.code}`);
  assert(parsed.error.hint?.includes("github"), "hint should mention supported provider");
});

test("mock create --output=json missing --api emits USAGE", () => {
  const r = run(["mock", "create", "--output=json"], {
    env: { SPEC0_TOKEN: "tok", SPEC0_ORG_ID: "org" },
  });
  assert(r.status === 2, `Expected exit 2 (USAGE), got ${r.status}`);
  const parsed = parseErrorJson(r.stdout, "mock create");
  assert(parsed.error.code === "USAGE", `expected code=USAGE, got ${parsed.error.code}`);
});

test("mock show --output=json without auth emits AUTH_MISSING", () => {
  const r = run(["mock", "show", "foo", "--output=json"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
  const parsed = parseErrorJson(r.stdout, "mock show");
  assert(parsed.error.code === "AUTH_MISSING", `expected AUTH_MISSING, got ${parsed.error.code}`);
});

// ── SPEC0_MODE=agent ─────────────────────────────────────────────────────────

section("SPEC0_MODE=agent");

test("agent mode: api list defaults to JSON even without --output", () => {
  const r = run(["api", "list"], {
    env: {
      SPEC0_MODE: "agent",
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `Expected exit 3 (AUTH_MISSING), got ${r.status}`);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Expected JSON in agent mode, got: ${r.stdout.slice(0, 200)}`);
  }
  assert(parsed.error?.code === "AUTH_MISSING", `expected AUTH_MISSING, got ${parsed.error?.code}`);
});

test("agent mode: doctor defaults to JSON", () => {
  const r = run(["doctor"], {
    env: {
      SPEC0_MODE: "agent",
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Expected JSON doctor report in agent mode, got: ${r.stdout.slice(0, 200)}`);
  }
  assert(Array.isArray(parsed.settings), "doctor report missing settings array");
});

test("agent mode: commands defaults to JSON", () => {
  const r = run(["commands"], { env: { SPEC0_MODE: "agent" } });
  assert(r.status === 0, `exit ${r.status}`);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    throw new Error(`Expected JSON manifest in agent mode, got: ${r.stdout.slice(0, 200)}`);
  }
  assert(Array.isArray(parsed.commands), "manifest missing commands array");
});

test("agent mode: output has no ANSI escape sequences", () => {
  const r = run(["api", "list"], {
    env: {
      SPEC0_MODE: "agent",
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  const combined = r.stdout + r.stderr;
  const ESC = String.fromCharCode(27);
  assert(
    !combined.includes(`${ESC}[`),
    `agent mode should emit no ANSI codes: ${JSON.stringify(combined)}`,
  );
});

test("agent mode: no update-check noise on stderr", () => {
  const r = run(["--version"], { env: { SPEC0_MODE: "agent" } });
  assert(r.status === 0, `exit ${r.status}`);
  // The update banner writes to stderr via notifyUpdateIfAvailable. Agent mode
  // skips that call entirely.
  assert(!r.stderr.includes("update available"), `agent mode leaked update noise: ${r.stderr}`);
});

test("agent mode: explicit --output=text overrides the default", () => {
  const r = run(["doctor", "--output=text"], {
    env: {
      SPEC0_MODE: "agent",
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.stdout.includes("spec0 configuration"), "expected text header not found");
});

test("text mode still prints errors to stderr (not stdout)", () => {
  const r = run(["api", "list"], {
    env: {
      SPEC0_TOKEN: "",
      SPEC0_ORG_ID: "",
      PLATFORM_API_TOKEN: "",
      PLATFORM_ORG_ID: "",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 3, `exit ${r.status}`);
  assert(r.stdout.trim() === "", `stdout should be empty in text-mode error, got: ${r.stdout}`);
  assert(r.stderr.includes("Not authenticated"), "stderr should have error message");
});

// ── whoami reflects the active context ───────────────────────────────────────
section("whoami reflects env override");

test("whoami reports the SPEC0_* env context, not just stored config", () => {
  const r = run(["whoami"], {
    env: {
      SPEC0_TOKEN: "pat_smoke_token",
      SPEC0_ORG_ID: "org-from-env-123",
      SPEC0_API_URL: "https://env-override.example.test",
      HOME: resolve(root, "test", ".jest-home"),
    },
  });
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`);
  assert(
    r.stdout.includes("org-from-env-123"),
    `Org should reflect env SPEC0_ORG_ID, got: ${r.stdout}`,
  );
  assert(
    r.stdout.includes("https://env-override.example.test"),
    `API URL should reflect env SPEC0_API_URL, got: ${r.stdout}`,
  );
  assert(
    r.stdout.includes("via environment"),
    `should flag the env-sourced context, got: ${r.stdout}`,
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${"─".repeat(50)}`);
console.log(`${passed}/${total} tests passed${failed > 0 ? `, ${failed} failed` : ""}`);

if (failed > 0) {
  process.exit(1);
}
