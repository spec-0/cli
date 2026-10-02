import { jest, describe, it, expect, afterEach } from "@jest/globals";
import { PublicRegistryService } from "@spec0/sdk-public-platform";
import { loadSpecContent } from "../src/lib/spec-source.js";

const ctx = { orgId: "org-1", apiKey: "spec0_sat_test", apiUrl: "https://api.example.test" };

describe("loadSpecContent — registry ref", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("fetches the latest spec via PublicRegistryService for an org/api ref", async () => {
    const yaml = "openapi: 3.0.3\ninfo:\n  title: Orders API\n  version: 1.0.0\n";
    const spy = jest
      .spyOn(PublicRegistryService, "getLatestPublicSpec")
      .mockResolvedValue(yaml as any);

    const out = await loadSpecContent("shopverse/orders-api", ctx);

    expect(out).toBe(yaml);
    expect(spy).toHaveBeenCalledWith({ orgSlug: "shopverse", apiName: "orders-api" });
  });

  it("fetches a pinned version via getPublicSpecByTag when a tag is given", async () => {
    const spy = jest
      .spyOn(PublicRegistryService, "getPublicSpecByTag")
      .mockResolvedValue("openapi: 3.0.3\n" as any);

    await loadSpecContent("shopverse/orders-api@1.2.0", ctx);

    expect(spy).toHaveBeenCalledWith({
      orgSlug: "shopverse",
      apiName: "orders-api",
      tag: "1.2.0",
    });
  });

  it("throws when the registry returns an empty spec", async () => {
    jest.spyOn(PublicRegistryService, "getLatestPublicSpec").mockResolvedValue("   \n" as any);

    await expect(loadSpecContent("shopverse/orders-api", ctx)).rejects.toThrow(/empty spec/i);
  });

  it("rejects a ref that is neither a local file nor a valid org/api", async () => {
    await expect(loadSpecContent("not-a-registry-ref", ctx)).rejects.toThrow(/requires/i);
  });
});
