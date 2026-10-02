/**
 * `spec0 setup` — the one-command onboarding flow (auth verify + mcp install +
 * skill install). Driven via spawnSync with a throwaway HOME so every artifact
 * lands under a temp dir. Auth is left unset, so the auth step reports
 * "not signed in" but the installs still run (they work anonymously).
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const rootDir = process.cwd();
const cli = join(rootDir, "dist", "index.js");

let testHome: string;

beforeAll(() => {
  if (!existsSync(cli)) {
    throw new Error(`Built CLI not found at ${cli}. Run \`npm run build\` first.`);
  }
});

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), "spec0-cli-setup-test-"));
});

afterEach(() => {
  if (testHome) rmSync(testHome, { recursive: true, force: true });
});

function run(args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync("node", [cli, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: testHome,
      SPEC0_MODE: "agent",
      SPEC0_TOKEN: undefined,
      SPEC0_ORG_ID: undefined,
      PLATFORM_API_TOKEN: undefined,
      PLATFORM_ORG_ID: undefined,
      ...env,
    },
  });
}

const cursorConfigPath = () => join(testHome, ".cursor", "mcp.json");
const skillPath = () => join(testHome, ".claude", "skills", "spec0", "SKILL.md");

describe("spec0 setup", () => {
  it("--client cursor installs the MCP config and skips the skill", () => {
    const r = run(["setup", "--client", "cursor"]);
    expect(r.status).toBe(0);

    const cfg = JSON.parse(readFileSync(cursorConfigPath(), "utf-8"));
    expect(cfg.mcpServers.spec0.url).toBe("https://api.spec0.io/mcp");
    // Skill is a Claude Code skill — not installed when only Cursor is targeted.
    expect(existsSync(skillPath())).toBe(false);
  });

  it("--client claude installs the skill (and exits 0 even without the claude binary)", () => {
    const r = run(["setup", "--client", "claude"]);
    expect(r.status).toBe(0);
    expect(existsSync(skillPath())).toBe(true);
  });

  it("reports 'not signed in' when no token is present, without failing", () => {
    const r = run(["setup", "--client", "cursor"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("not signed in");
  });

  it("rejects an unknown client", () => {
    const r = run(["setup", "--client", "bogus"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("Unknown client");
  });
});
