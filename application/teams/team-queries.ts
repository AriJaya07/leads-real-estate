import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/infrastructure/db/client";

export interface TeamMemberSummary {
  userId: string;
  name: string | null;
  email: string;
  roleInTeam: string;
}

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  members: TeamMemberSummary[];
}

/**
 * Sub-groups within the company, distinct from the company-wide roster
 * `listTeamMembers()` (`application/auth/team.actions.ts`) already serves —
 * see docs/saas-database-schema.md for why these are two different things
 * sharing an unfortunately similar name.
 */
export async function listTeams(companyId: string): Promise<TeamSummary[]> {
  const teams = await db()
    .select({ id: schema.teams.id, name: schema.teams.name, description: schema.teams.description })
    .from(schema.teams)
    .where(eq(schema.teams.companyId, companyId))
    .orderBy(schema.teams.createdAt);

  const members = await db()
    .select({
      teamId: schema.teamMembers.teamId,
      userId: schema.teamMembers.userId,
      roleInTeam: schema.teamMembers.roleInTeam,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
    .where(eq(schema.teams.companyId, companyId));

  const membersByTeam = new Map<string, TeamMemberSummary[]>();
  for (const m of members) {
    const list = membersByTeam.get(m.teamId) ?? [];
    list.push({ userId: m.userId, name: m.name, email: m.email, roleInTeam: m.roleInTeam });
    membersByTeam.set(m.teamId, list);
  }

  return teams.map((team) => ({ ...team, members: membersByTeam.get(team.id) ?? [] }));
}
