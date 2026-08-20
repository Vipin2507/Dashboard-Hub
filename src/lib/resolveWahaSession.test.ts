import { describe, expect, it } from "vitest";
import { resolveWahaSession } from "@/lib/automationService";

describe("resolveWahaSession", () => {
  it("uses template session when set", () => {
    expect(resolveWahaSession({ wahaSession: "sales-desk" }, { wahaSession: "first" })).toBe("sales-desk");
  });

  it("falls back to settings when template session is blank", () => {
    expect(resolveWahaSession({ wahaSession: "  " }, { wahaSession: "first" })).toBe("first");
    expect(resolveWahaSession({}, { wahaSession: "first" })).toBe("first");
    expect(resolveWahaSession(null, { wahaSession: "first" })).toBe("first");
  });

  it("defaults when both are empty", () => {
    expect(resolveWahaSession({}, { wahaSession: "" })).toBe("default");
  });
});
