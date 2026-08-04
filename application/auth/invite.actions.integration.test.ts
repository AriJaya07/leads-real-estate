import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/infrastructure/db/client";
import { hashToken } from "@/infrastructure/auth/tokens";
import { getInviteByToken, listPendingInvites } from "./invite.actions";
import { resetDb } from "@/test/integration/db-helpers";

async function seedCompany() {
  const [company] = await db()
    .insert(schema.companies)
    .values({ name: `Invite Test Co ${crypto.randomUUID()}`, slug: `invite-test-${crypto.randomUUID()}` })
    .returning();
  return company;
}

async function seedOwner(companyId: string) {
  const [owner] = await db()
    .insert(schema.users)
    .values({ companyId, email: `owner-${crypto.randomUUID()}@example.com`, role: "owner" })
    .returning();
  return owner;
}

async function seedInvite(
  companyId: string,
  invitedByUserId: string,
  overrides: Partial<typeof schema.invites.$inferInsert> = {},
) {
  const token = `token-${crypto.randomUUID()}`;
  const [invite] = await db()
    .insert(schema.invites)
    .values({
      companyId,
      email: `invitee-${crypto.randomUUID()}@example.com`,
      role: "member",
      tokenHash: hashToken(token),
      invitedByUserId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ...overrides,
    })
    .returning();
  return { invite, token };
}

describe("getInviteByToken", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("returns the invite for a valid, unexpired, unaccepted token", async () => {
    const company = await seedCompany();
    const owner = await seedOwner(company.id);
    const { invite, token } = await seedInvite(company.id, owner.id, { role: "manager" });

    expect(await getInviteByToken(token)).toEqual({
      email: invite.email,
      role: "manager",
      companyName: company.name,
      invitedBy: owner.email,
      expiresAt: invite.expiresAt,
    });
  });

  it("returns null for an unknown token", async () => {
    expect(await getInviteByToken("no-such-token")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const company = await seedCompany();
    const owner = await seedOwner(company.id);
    const { token } = await seedInvite(company.id, owner.id, {
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    expect(await getInviteByToken(token)).toBeNull();
  });

  it("returns null for an already-accepted token", async () => {
    const company = await seedCompany();
    const owner = await seedOwner(company.id);
    const { token } = await seedInvite(company.id, owner.id, { acceptedAt: new Date() });

    expect(await getInviteByToken(token)).toBeNull();
  });

  it("returns null for a revoked token", async () => {
    const company = await seedCompany();
    const owner = await seedOwner(company.id);
    const { token } = await seedInvite(company.id, owner.id, { revokedAt: new Date() });

    expect(await getInviteByToken(token)).toBeNull();
  });
});

describe("listPendingInvites", () => {
  beforeAll(async () => {
    await resetDb();
  });
  afterEach(async () => {
    await resetDb();
  });

  it("lists outstanding invites and flags expired ones without excluding them", async () => {
    const company = await seedCompany();
    const owner = await seedOwner(company.id);
    const { invite: fresh } = await seedInvite(company.id, owner.id);
    const { invite: expired } = await seedInvite(company.id, owner.id, {
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const rows = await listPendingInvites(company.id);
    const byId = new Map(rows.map((r) => [r.id, r]));

    expect(byId.get(fresh.id)?.expired).toBe(false);
    expect(byId.get(expired.id)?.expired).toBe(true);
  });

  it("excludes accepted and revoked invites", async () => {
    const company = await seedCompany();
    const owner = await seedOwner(company.id);
    await seedInvite(company.id, owner.id, { acceptedAt: new Date() });
    await seedInvite(company.id, owner.id, { revokedAt: new Date() });
    const { invite: outstanding } = await seedInvite(company.id, owner.id);

    const rows = await listPendingInvites(company.id);
    expect(rows.map((r) => r.id)).toEqual([outstanding.id]);
  });

  it("scopes to the given company", async () => {
    const companyA = await seedCompany();
    const ownerA = await seedOwner(companyA.id);
    const companyB = await seedCompany();
    const ownerB = await seedOwner(companyB.id);
    await seedInvite(companyB.id, ownerB.id);
    const { invite: inviteA } = await seedInvite(companyA.id, ownerA.id);

    const rows = await listPendingInvites(companyA.id);
    expect(rows.map((r) => r.id)).toEqual([inviteA.id]);
  });
});
