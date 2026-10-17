import { jest, describe, it, expect, afterEach } from "@jest/globals";
import { ApiError, PublicApisService } from "@spec0/sdk-public-platform";
import { leanSummaryFromList } from "../src/commands/api/show.js";

const API_ID = "11111111-2222-3333-4444-555555555555";

const row = {
  apiId: API_ID,
  apiName: "orders-api",
  version: "1.2.0",
  teamId: "team-1",
  teamName: "payments",
};

function apiError(status: number): ApiError {
  return new ApiError(
    { method: "GET", url: "/v1/team/apis" } as any,
    { url: "/v1/team/apis", ok: false, status, statusText: String(status), body: {} },
    `HTTP ${status}`,
  );
}

describe("leanSummaryFromList — api show fallback", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the V1 row matched by id", async () => {
    jest.spyOn(PublicApisService, "listTeamApis").mockResolvedValue([row] as any);

    const out = await leanSummaryFromList(API_ID, { kind: "uuid", apiId: API_ID });

    expect(out).toMatchObject({ apiId: API_ID, apiName: "orders-api", teamName: "payments" });
  });

  it("matches by name for an <org>/<api> ref", async () => {
    jest.spyOn(PublicApisService, "listTeamApis").mockResolvedValue([row] as any);

    const out = await leanSummaryFromList("other-id", {
      kind: "name",
      org: "shopverse",
      api: "Orders-API",
    });

    expect(out?.apiId).toBe(API_ID);
  });

  it("returns undefined when the API isn't in the list", async () => {
    jest.spyOn(PublicApisService, "listTeamApis").mockResolvedValue([row] as any);

    const absent = "00000000-0000-0000-0000-000000000000";
    expect(await leanSummaryFromList(absent, { kind: "uuid", apiId: absent })).toBeUndefined();
  });

  it("degrades to undefined when the list itself is unavailable (404)", async () => {
    jest.spyOn(PublicApisService, "listTeamApis").mockRejectedValue(apiError(404));

    expect(await leanSummaryFromList(API_ID, { kind: "uuid", apiId: API_ID })).toBeUndefined();
  });

  it("rethrows a 401 so the caller reports a bad token, not 'not found'", async () => {
    jest.spyOn(PublicApisService, "listTeamApis").mockRejectedValue(apiError(401));

    await expect(
      leanSummaryFromList(API_ID, { kind: "uuid", apiId: API_ID }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
