import { buildLoginUrl, generateLoginState, parseLoginCallback } from "../src/lib/browser-login.js";

const STATE = "abc123";

function params(q: Record<string, string>): URLSearchParams {
  return new URLSearchParams(q);
}

describe("browser login", () => {
  describe("buildLoginUrl", () => {
    it("sends state, redirect_uri and client=cli to /cli-auth", () => {
      const url = buildLoginUrl(
        "https://app.example.com",
        STATE,
        "http://127.0.0.1:38500/callback",
      );
      expect(url.origin).toBe("https://app.example.com");
      expect(url.pathname).toBe("/cli-auth");
      expect(url.searchParams.get("state")).toBe(STATE);
      expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:38500/callback");
      expect(url.searchParams.get("client")).toBe("cli");
    });
  });

  describe("generateLoginState", () => {
    it("returns 32 hex chars and differs between calls", () => {
      const a = generateLoginState();
      const b = generateLoginState();
      expect(a).toMatch(/^[0-9a-f]{32}$/);
      expect(a).not.toBe(b);
    });
  });

  describe("parseLoginCallback", () => {
    const ok = { token: "tok", org: "org-1", org_name: "Acme" };

    it("accepts a callback whose state matches", () => {
      expect(parseLoginCallback(params({ ...ok, state: STATE }), STATE)).toEqual({
        kind: "success",
        token: "tok",
        orgId: "org-1",
        orgName: "Acme",
      });
    });

    it("rejects a callback whose state does not match", () => {
      const r = parseLoginCallback(params({ ...ok, state: "other" }), STATE);
      expect(r.kind).toBe("error");
      if (r.kind === "error") expect(r.message).toMatch(/state mismatch/);
    });

    it("rejects an empty state as a mismatch", () => {
      expect(parseLoginCallback(params({ ...ok, state: "" }), STATE).kind).toBe("error");
    });

    it("accepts a callback with no state (sign-in pages that don't echo it)", () => {
      expect(parseLoginCallback(params(ok), STATE)).toEqual({
        kind: "success",
        token: "tok",
        orgId: "org-1",
        orgName: "Acme",
      });
    });

    it("defaults org name when absent", () => {
      const r = parseLoginCallback(params({ token: "tok", org: "org-1" }), STATE);
      expect(r).toMatchObject({ kind: "success", orgName: "default" });
    });

    it("treats error=access_denied as cancelled", () => {
      expect(parseLoginCallback(params({ error: "access_denied", state: STATE }), STATE)).toEqual({
        kind: "cancelled",
      });
      expect(parseLoginCallback(params({ error: "access_denied" }), STATE)).toEqual({
        kind: "cancelled",
      });
    });

    it("does not treat a cancel with a mismatched state as a cancel", () => {
      const r = parseLoginCallback(params({ error: "access_denied", state: "other" }), STATE);
      expect(r.kind).toBe("error");
    });

    it("reports other error values plainly", () => {
      expect(parseLoginCallback(params({ error: "server_error", state: STATE }), STATE)).toEqual({
        kind: "error",
        message: "Sign-in failed: server_error",
      });
      expect(
        parseLoginCallback(
          params({ error: "invalid_request", error_description: "bad redirect", state: STATE }),
          STATE,
        ),
      ).toEqual({ kind: "error", message: "Sign-in failed: invalid_request (bad redirect)" });
    });

    it("an error wins over a token in the same callback", () => {
      const r = parseLoginCallback(params({ ...ok, error: "access_denied", state: STATE }), STATE);
      expect(r.kind).toBe("cancelled");
    });

    it("errors when token or org is missing", () => {
      expect(parseLoginCallback(params({ token: "tok", state: STATE }), STATE)).toEqual({
        kind: "error",
        message: "Missing token or org",
      });
    });
  });
});
