import { describe, expect, it } from "vitest";

import { isMaintenanceOn, MAINTENANCE_ON } from "./maintenance";

// The whole point of this rule is that it fails towards *serving the site*, so
// most of these cases assert that something plausible-looking does NOT take the
// public website down.
describe("isMaintenanceOn", () => {
  it("is on for the exact keyword", () => {
    expect(isMaintenanceOn(MAINTENANCE_ON)).toBe(true);
  });

  it("forgives casing and padding a deployment console might add", () => {
    expect(isMaintenanceOn("ON")).toBe(true);
    expect(isMaintenanceOn("  On  ")).toBe(true);
  });

  it("is off when the variable is unset or blank", () => {
    expect(isMaintenanceOn(undefined)).toBe(false);
    expect(isMaintenanceOn("")).toBe(false);
    expect(isMaintenanceOn("   ")).toBe(false);
  });

  it("refuses every other truthy-looking value", () => {
    for (const value of ["true", "1", "yes", "y", "enabled", "maintenance"]) {
      expect(isMaintenanceOn(value)).toBe(false);
    }
  });

  it("is off for values that plainly mean off", () => {
    for (const value of ["off", "false", "0", "no"]) {
      expect(isMaintenanceOn(value)).toBe(false);
    }
  });
});
