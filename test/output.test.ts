import { formatLintText, formatPublishText, formatGitHubAnnotation } from "../src/lib/output.js";

describe("formatPublishText", () => {
  const base = {
    apiId: "abc-123",
    apiName: "payment-api",
    version: "1.2.0",
    specUrl: "https://app.spec0.io/apis/abc-123",
  };

  it("shows Created label on first publish", () => {
    const out = formatPublishText({ ...base, created: true });
    expect(out).toContain("Created");
    expect(out).toContain("payment-api");
    expect(out).toContain("v1.2.0");
  });

  it("shows Updated label on subsequent push", () => {
    const out = formatPublishText({ ...base, created: false });
    expect(out).toContain("Updated");
  });

  it("shows team name when provided", () => {
    const out = formatPublishText({ ...base, teamName: "platform-team" });
    expect(out).toContain("platform-team");
  });

  it("shows registry URL when provided", () => {
    const out = formatPublishText({ ...base, registryUrl: "/registry/acme/payment-api" });
    expect(out).toContain("/registry/acme/payment-api");
  });

  it("shows mock URL when provided", () => {
    const out = formatPublishText({ ...base, mockUrl: "https://mock.spec0.io/acme/payment-api" });
    expect(out).toContain("https://mock.spec0.io/acme/payment-api");
  });

  it("noChanges — shows already-up-to-date, no Created/Updated label", () => {
    const out = formatPublishText({ ...base, noChanges: true });
    expect(out).toContain("Already up to date");
    expect(out).not.toContain("Created");
    expect(out).not.toContain("Updated");
  });

  it("noChanges — shows api name and version", () => {
    const out = formatPublishText({ ...base, noChanges: true });
    expect(out).toContain("payment-api");
    expect(out).toContain("1.2.0");
  });

  it("versionUnchanged — shows warning hint with default message", () => {
    const out = formatPublishText({ ...base, versionUnchanged: true });
    expect(out).toContain("1.2.0");
    expect(out).toContain("--semver");
  });

  it("versionUnchanged — shows custom hint when provided", () => {
    const out = formatPublishText({
      ...base,
      versionUnchanged: true,
      versionUnchangedHint: "Custom hint here",
    });
    expect(out).toContain("Custom hint here");
  });

  it("renders governance warnings when present", () => {
    const out = formatPublishText({
      ...base,
      created: true,
      governanceWarnings: [
        { section: "naming", message: "operationId getThings is not camelCase" },
        { section: "requiredFields", message: "GET /things is missing a description" },
      ],
    });
    expect(out).toContain("2 governance warnings");
    expect(out).toContain("[naming]");
    expect(out).toContain("operationId getThings is not camelCase");
    expect(out).toContain("[requiredFields]");
  });

  it("omits the governance warnings block when there are none", () => {
    const out = formatPublishText({ ...base, created: true, governanceWarnings: [] });
    expect(out).not.toContain("governance warning");
  });
});

describe("formatLintText", () => {
  it("shows score", () => {
    const out = formatLintText({ score: 85, errors: [], warnings: [] });
    expect(out).toContain("85/100");
  });

  it("shows zero errors message when clean", () => {
    const out = formatLintText({ score: 100, errors: [], warnings: [] });
    expect(out).toContain("0 errors");
    expect(out).toContain("publishable");
  });

  it("shows error count and details", () => {
    const out = formatLintText({
      score: 70,
      errors: [{ line: 10, message: "Missing description", rule: "oas3-api-servers" }],
      warnings: [],
    });
    expect(out).toContain("1");
    expect(out).toContain("Missing description");
    expect(out).toContain("oas3-api-servers");
  });

  it("shows warning details", () => {
    const out = formatLintText({
      score: 90,
      errors: [],
      warnings: [{ line: 5, message: "Tag missing description", rule: "tag-description" }],
    });
    expect(out).toContain("Tag missing description");
  });
});

describe("formatGitHubAnnotation", () => {
  it("formats error annotation", () => {
    const out = formatGitHubAnnotation("openapi.yaml", 42, "error", "Missing description");
    expect(out).toBe("::error file=openapi.yaml,line=42::Missing description");
  });

  it("formats warning annotation", () => {
    const out = formatGitHubAnnotation("api/spec.yaml", 7, "warning", "Prefer snake_case");
    expect(out).toBe("::warning file=api/spec.yaml,line=7::Prefer snake_case");
  });

  it("encodes newlines in message", () => {
    const out = formatGitHubAnnotation("openapi.yaml", 1, "error", "line1\nline2");
    expect(out).toContain("%0A");
  });
});
