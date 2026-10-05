import { eq } from "drizzle-orm";
import { database } from "./database.server";
import { roleAssignment, alumniMembership, organizationBootstrap } from "./schema";

export function authorizationRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async currentAccess(userId: string) {
      const [roles, memberships, primary] = await db.batch([
        db
          .select({ role: roleAssignment.role })
          .from(roleAssignment)
          .where(eq(roleAssignment.userId, userId)),
        db
          .select({ status: alumniMembership.status, house: alumniMembership.house })
          .from(alumniMembership)
          .where(eq(alumniMembership.userId, userId)),
        db
          .select({ userId: organizationBootstrap.primaryUserId })
          .from(organizationBootstrap)
          .where(eq(organizationBootstrap.primaryUserId, userId)),
      ]);
      return {
        roles: roles.map((row) => row.role),
        membership: memberships.at(0),
        primary: primary.length === 1,
      };
    },
  };
}
