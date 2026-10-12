import { describe, expect, it } from "vitest";

import { hasAnyPermission, hasPermission, pickOrganization, type Access } from "./access-model";

const org = (id: string, permissions: string[]) => ({
  id,
  name: id,
  member_id: "00000000-0000-4000-8000-000000000001",
  full_name: "Тест",
  all_projects: false,
  requires_mfa: false,
  roles: [],
  permissions,
  project_ids: [],
});

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const access: Access = { aal: "aal1", organizations: [org(A, ["projects.view"]), org(B, [])] };

describe("pickOrganization", () => {
  it("берёт организацию из cookie, если пользователь в ней состоит", () => {
    expect(pickOrganization(access, B)?.id).toBe(B);
  });
  it("игнорирует чужую организацию из cookie", () => {
    expect(pickOrganization(access, "00000000-0000-4000-8000-0000000000ff")?.id).toBe(A);
  });
  it("без организаций — null", () => {
    expect(pickOrganization({ aal: "aal1", organizations: [] }, A)).toBeNull();
  });
});

describe("права", () => {
  it("hasPermission / hasAnyPermission", () => {
    const a = pickOrganization(access, A);
    expect(hasPermission(a, "projects.view")).toBe(true);
    expect(hasPermission(a, "members.manage")).toBe(false);
    expect(hasAnyPermission(a, ["members.manage", "projects.view"])).toBe(true);
    expect(hasPermission(null, "projects.view")).toBe(false);
  });
});
