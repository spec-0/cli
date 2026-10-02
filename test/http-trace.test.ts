import { httpTimeoutMs } from "../src/lib/http-trace.js";

const SAVED = process.env.SPEC0_HTTP_TIMEOUT_MS;

afterEach(() => {
  if (SAVED === undefined) delete process.env.SPEC0_HTTP_TIMEOUT_MS;
  else process.env.SPEC0_HTTP_TIMEOUT_MS = SAVED;
});

describe("httpTimeoutMs", () => {
  it("defaults to 30s when unset", () => {
    delete process.env.SPEC0_HTTP_TIMEOUT_MS;
    expect(httpTimeoutMs()).toBe(30_000);
  });

  it("honours a valid SPEC0_HTTP_TIMEOUT_MS override", () => {
    process.env.SPEC0_HTTP_TIMEOUT_MS = "5000";
    expect(httpTimeoutMs()).toBe(5000);
  });

  it("falls back to the default for non-positive or invalid values", () => {
    for (const bad of ["0", "-1", "abc", ""]) {
      process.env.SPEC0_HTTP_TIMEOUT_MS = bad;
      expect(httpTimeoutMs()).toBe(30_000);
    }
  });
});
