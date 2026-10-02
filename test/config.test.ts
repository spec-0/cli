import {
  getConfig,
  setOrgConfig,
  setDefaultOrg,
  clearConfig,
  getOrgConfig,
  replaceSoleOrg,
} from "../src/lib/config.js";

describe("config", () => {
  const testOrgId = "test-org-" + Date.now();

  afterEach(() => {
    clearConfig();
  });

  it("returns default config", () => {
    const config = getConfig();
    expect(config.version).toBe(1);
    expect(config.telemetry).toBe(true);
    expect(Object.keys(config.orgs).length).toBeGreaterThanOrEqual(0);
  });

  it("stores and retrieves org config", () => {
    setOrgConfig(testOrgId, {
      apiKey: "key",
      name: "acme",
      apiUrl: "https://api.spec0.io",
    });
    const org = getOrgConfig(testOrgId);
    expect(org?.name).toBe("acme");
  });

  it("stores default org", () => {
    setOrgConfig(testOrgId, { apiKey: "k", name: "a", apiUrl: "https://x.io" });
    setDefaultOrg(testOrgId);
    expect(getConfig().defaultOrg).toBe(testOrgId);
  });

  describe("replaceSoleOrg (single-org model)", () => {
    it("prunes a stale prior org and makes the new one the default", () => {
      // Simulate the bug scenario: an old org pointing at a dead localhost base
      // is the current default when the user logs into a new (prod) org.
      setOrgConfig("stale-localhost", {
        apiKey: "old",
        name: "First-org",
        apiUrl: "http://localhost:3000",
      });
      setDefaultOrg("stale-localhost");

      replaceSoleOrg("prod-org", {
        apiKey: "new",
        name: "Prod Org",
        apiUrl: "https://api.spec0.io",
      });

      const config = getConfig();
      // The stale org is gone — it can no longer silently win as the default.
      expect(Object.keys(config.orgs)).toEqual(["prod-org"]);
      expect(config.orgs["stale-localhost"]).toBeUndefined();
      // The org just logged into is the active one.
      expect(config.defaultOrg).toBe("prod-org");
      expect(getOrgConfig("prod-org")?.apiUrl).toBe("https://api.spec0.io");
    });
  });
});
