import { describe, it, expect } from "@jest/globals";
import path from "path";
import { runSpectral } from "../src/lib/lint.js";

const fixture = (name: string) => path.join(process.cwd(), "test", "fixtures", name);

describe("runSpectral", () => {
  // Regression for #55: spectral-rulesets <1.22.7 threw
  // "Cannot read properties of null (reading 'enum')" from the typed-enum
  // rule when a spec contained null values (e.g. in response examples).
  it("lints specs with null-valued nodes instead of crashing", async () => {
    const result = await runSpectral(fixture("null-enum-adjacent.yaml"));

    expect(result.errors).toEqual([]);
    expect(result.score).toBeGreaterThan(0);
  });
});
