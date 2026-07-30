import { describe, expect, it } from "vitest";
import { canAssignRole, isRole, roleAtLeast } from "./permissions";

describe("roleAtLeast", () => {
  it("ranks owner above every other role", () => {
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("owner", "manager")).toBe(true);
    expect(roleAtLeast("owner", "member")).toBe(true);
  });

  it("ranks member below every other role", () => {
    expect(roleAtLeast("member", "manager")).toBe(false);
    expect(roleAtLeast("member", "admin")).toBe(false);
    expect(roleAtLeast("member", "owner")).toBe(false);
  });

  it("is reflexive", () => {
    expect(roleAtLeast("manager", "manager")).toBe(true);
  });

  it("a lower role does not meet a higher minimum", () => {
    expect(roleAtLeast("manager", "admin")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("only an owner may assign the owner role", () => {
    expect(canAssignRole("owner", "owner")).toBe(true);
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("manager", "owner")).toBe(false);
  });

  it("admin and above may assign any non-owner role", () => {
    expect(canAssignRole("admin", "manager")).toBe(true);
    expect(canAssignRole("admin", "member")).toBe(true);
    expect(canAssignRole("owner", "member")).toBe(true);
  });

  it("below admin may not assign roles", () => {
    expect(canAssignRole("manager", "member")).toBe(false);
    expect(canAssignRole("member", "member")).toBe(false);
  });
});

describe("isRole", () => {
  it("accepts the four known roles", () => {
    expect(isRole("owner")).toBe(true);
    expect(isRole("admin")).toBe(true);
    expect(isRole("manager")).toBe(true);
    expect(isRole("member")).toBe(true);
  });

  it("rejects anything else, including the retired 'agent' value", () => {
    expect(isRole("agent")).toBe(false);
    expect(isRole("")).toBe(false);
  });
});
