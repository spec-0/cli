import { buildApiError } from "../src/lib/errors.js";
import { ExitCode } from "../src/lib/exit-codes.js";

/** Build a `got`-style HTTP error (status + body + requestUrl). */
function httpError(status: number, body: unknown, url = "https://api.spec0.io/x") {
  return {
    message: "Response code " + status,
    options: { method: "GET" },
    response: { statusCode: status, body, requestUrl: url },
  };
}

/** Build a network-style error (no HTTP response; code on the cause). */
function networkError(code: string) {
  return { message: "fetch failed", cause: { code } };
}

describe("buildApiError — HTTP status classification", () => {
  const cases: Array<[number, number]> = [
    [401, ExitCode.AUTH_MISSING],
    [403, ExitCode.PERMISSION_DENIED],
    [404, ExitCode.NOT_FOUND],
    [409, ExitCode.CONFLICT],
    [422, ExitCode.VALIDATION],
    [429, ExitCode.RATE_LIMITED],
    [500, ExitCode.SERVER_ERROR],
    [503, ExitCode.SERVER_ERROR],
  ];

  it.each(cases)("maps HTTP %i to the right exit code", (status, expected) => {
    const report = buildApiError(httpError(status, { message: "boom" }), { action: "api list" });
    expect(report.code).toBe(expected);
  });

  it("surfaces the server message, status, and request line", () => {
    const report = buildApiError(
      httpError(404, { message: "No such API" }, "https://api.spec0.io/api/v1/public/apis/team"),
      { action: "api list", org: "Acme", apiUrl: "https://api.spec0.io" },
      "json",
    );
    expect(report.message).toContain("No such API");
    expect(report.message).toContain("HTTP 404");
    expect(report.details).toMatchObject({
      status: 404,
      request: "GET https://api.spec0.io/api/v1/public/apis/team",
      org: "Acme",
      apiUrl: "https://api.spec0.io",
    });
  });

  it("includes request + org inline in text mode but not in the message for json", () => {
    const err = httpError(404, { message: "nope" }, "https://api.spec0.io/x");
    const text = buildApiError(err, { action: "api list", org: "Acme" }, "text");
    const json = buildApiError(err, { action: "api list", org: "Acme" }, "json");
    expect(text.message).toContain("\n  GET https://api.spec0.io/x");
    expect(text.message).toContain("org: Acme");
    // json keeps the message single-line; context rides in details.
    expect(json.message).not.toContain("\n");
  });
});

describe("buildApiError — network errors", () => {
  it("classifies connection refused as NETWORK_ERROR with a readable label", () => {
    const report = buildApiError(networkError("ECONNREFUSED"), { action: "api list" });
    expect(report.code).toBe(ExitCode.NETWORK_ERROR);
    expect(report.message).toContain("connection refused");
  });

  it("classifies DNS failure as NETWORK_ERROR", () => {
    const report = buildApiError(networkError("ENOTFOUND"), { action: "api list" });
    expect(report.code).toBe(ExitCode.NETWORK_ERROR);
    expect(report.message).toContain("host not found");
  });

  it("classifies a fetch timeout (DOMException name, no code) as NETWORK_ERROR", () => {
    const err = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    const report = buildApiError(err, { action: "api list" });
    expect(report.code).toBe(ExitCode.NETWORK_ERROR);
    expect(report.message).toContain("timed out");
  });

  it("classifies an aborted request as NETWORK_ERROR", () => {
    const err = Object.assign(new Error("aborted"), { name: "AbortError" });
    const report = buildApiError(err, { action: "api list" });
    expect(report.code).toBe(ExitCode.NETWORK_ERROR);
    expect(report.message).toContain("request aborted");
  });

  it("falls back to the raw message when nothing else is available", () => {
    const report = buildApiError(new Error("kaboom"), { action: "api list" });
    expect(report.code).toBe(ExitCode.NETWORK_ERROR);
    expect(report.message).toContain("kaboom");
  });
});
