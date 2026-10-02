/**
 * `spec0 skill install` / `spec0 skill path` — file-writing behaviour.
 *
 * Drives the built CLI via spawnSync (like the mcp suite) with a throwaway HOME
 * and CWD so the skill lands under a temp dir, not the developer's real home or
 * this repo.
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
  testHome = mkdtempSync(join(tmpdir(), "spec0-cli-skill-test-"));
});

afterEach(() => {
  if (testHome) rmSync(testHome, { recursive: true, force: true });
});

function run(args: string[], cwd: string = rootDir) {
  return spawnSync("node", [cli, ...args], {
    encoding: "utf8",
    cwd,
    env: { ...process.env, HOME: testHome, SPEC0_MODE: "agent" },
  });
}

const personalSkillPath = () => join(testHome, ".claude", "skills", "spec0", "SKILL.md");

describe("spec0 skill install", () => {
  it("writes ~/.claude/skills/spec0/SKILL.md with the skill frontmatter", () => {
    const r = run(["skill", "install"]);
    expect(r.status).toBe(0);

    const path = personalSkillPath();
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, "utf-8");
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("name: spec0");
    // The skill must point agents at the real MCP discovery tools.
    expect(content).toContain("search_apis");
    expect(content).toContain("get_operation");
  });

  it("installs into the project root with --scope project", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "spec0-cli-skill-proj-"));
    try {
      const r = run(["skill", "install", "--scope", "project"], projectDir);
      expect(r.status).toBe(0);
      expect(existsSync(join(projectDir, ".claude", "skills", "spec0", "SKILL.md"))).toBe(true);
      // Personal location must be untouched for a project-scoped install.
      expect(existsSync(personalSkillPath())).toBe(false);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("rejects an unknown scope", () => {
    const r = run(["skill", "install", "--scope", "bogus"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("Unknown scope");
  });

  it("is idempotent — re-running overwrites cleanly and still exits 0", () => {
    expect(run(["skill", "install"]).status).toBe(0);
    const r = run(["skill", "install"]);
    expect(r.status).toBe(0);
    expect(existsSync(personalSkillPath())).toBe(true);
  });
});

describe("spec0 skill path", () => {
  it("prints the personal install path", () => {
    const r = run(["skill", "path"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(personalSkillPath());
  });
});
