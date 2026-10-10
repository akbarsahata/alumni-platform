import { desc, eq, sql } from "drizzle-orm";
import { database } from "./database.server";
import { schoolNeed, schoolNeedApproval, schoolNeedRevision } from "./schema";
import type {
  LocationMode,
  NeedCategory,
  NeedStatus,
  ParticipationTerm,
} from "../school-needs/model";

type NeedInput = {
  category: NeedCategory;
  title: string;
  purpose: string;
  requestedHelp: string;
  timeCommitment: string;
  timing: string;
  deadline: string | null;
  locationMode: LocationMode;
  locationDetails: string;
  staffContactUserId: string;
  participationTerms: ParticipationTerm;
  paidDetails: string;
  initiativeLink: string;
};

type NeedSummary = {
  id: string;
  version: number;
  category: NeedCategory;
  title: string;
  updatedAt: string;
  staffContactUserId: string;
  staffContactName: string;
  staffValidated: boolean;
  coordinatorApproved: boolean;
  status: NeedStatus;
};

type SummaryRow = Omit<NeedSummary, "staffValidated" | "coordinatorApproved"> & {
  staffValidated: number;
  coordinatorApproved: number;
};

function summaryFromRow(row: SummaryRow): NeedSummary {
  return {
    ...row,
    staffValidated: row.staffValidated === 1,
    coordinatorApproved: row.coordinatorApproved === 1,
  };
}

const summaryFields = sql`
  n.id,n.version,n.category,n.title,n.updated_at AS updatedAt,
  n.staff_contact_user_id AS staffContactUserId,n.staff_contact_name AS staffContactName,
  EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
    AND a.version=n.version AND a.stage='staff-validation') AS staffValidated,
  EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
    AND a.version=n.version AND a.stage='directory-approval') AS coordinatorApproved,
  CASE
    WHEN EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
      AND a.version=n.version AND a.stage='staff-validation')
     AND EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
      AND a.version=n.version AND a.stage='directory-approval') THEN 'approved'
    WHEN EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
      AND a.version=n.version AND a.stage='staff-validation') THEN 'awaiting-coordinator'
    ELSE 'awaiting-staff'
  END AS status
`;

export function schoolNeedsRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async staffContacts() {
      return await db.all<{ id: string; name: string }>(sql`
        SELECT u.id,COALESCE(NULLIF(trim(u.name),''),'Akun staf ' || substr(u.id,1,8)) AS name
        FROM user u JOIN role_assignment r ON r.user_id=u.id
        WHERE r.role='staff' AND u.email_verified=1
        ORDER BY u.name COLLATE NOCASE,u.id
      `);
    },
    async ownNeeds(userId: string) {
      const rows = await db.all<SummaryRow>(sql`
        SELECT ${summaryFields} FROM school_need n JOIN user u ON u.id=n.staff_contact_user_id
        WHERE n.submitter_user_id=${userId} ORDER BY n.updated_at DESC,n.id LIMIT 100
      `);
      return rows.map(summaryFromRow);
    },
    async staffQueue(userId: string) {
      const rows = await db.all<SummaryRow>(sql`
        SELECT ${summaryFields} FROM school_need n JOIN user u ON u.id=n.staff_contact_user_id
        WHERE n.staff_contact_user_id=${userId}
          AND NOT EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
            AND a.version=n.version AND a.stage='staff-validation')
        ORDER BY n.updated_at DESC,n.id LIMIT 100
      `);
      return rows.map(summaryFromRow);
    },
    async coordinatorQueue() {
      const rows = await db.all<SummaryRow>(sql`
        SELECT ${summaryFields} FROM school_need n JOIN user u ON u.id=n.staff_contact_user_id
        WHERE EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
          AND a.version=n.version AND a.stage='staff-validation')
          AND NOT EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
          AND a.version=n.version AND a.stage='directory-approval')
        ORDER BY n.updated_at DESC,n.id LIMIT 100
      `);
      return rows.map(summaryFromRow);
    },
    async visibility(needId: string, actorId: string) {
      const rows = await db.all<{
        submitterUserId: string;
        staffContactUserId: string;
        staffValidated: number;
        coordinatorApproved: number;
        coordinatorApprovedByActor: number;
      }>(sql`
        SELECT n.submitter_user_id AS submitterUserId,
          n.staff_contact_user_id AS staffContactUserId,
          EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
            AND a.version=n.version AND a.stage='staff-validation') AS staffValidated,
          EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
            AND a.version=n.version AND a.stage='directory-approval') AS coordinatorApproved,
          EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
            AND a.version=n.version AND a.stage='directory-approval'
            AND a.actor_user_id=${actorId}) AS coordinatorApprovedByActor
        FROM school_need n WHERE n.id=${needId}
      `);
      const row = rows[0];
      return row
        ? {
            ...row,
            staffValidated: row.staffValidated === 1,
            coordinatorApproved: row.coordinatorApproved === 1,
            coordinatorApprovedByActor: row.coordinatorApprovedByActor === 1,
          }
        : undefined;
    },
    async detail(needId: string) {
      const [needs, revisions, approvals] = await db.batch([
        db
          .select({
            id: schoolNeed.id,
            version: schoolNeed.version,
            submitterUserId: schoolNeed.submitterUserId,
            createdAt: schoolNeed.createdAt,
            updatedAt: schoolNeed.updatedAt,
            category: schoolNeed.category,
            title: schoolNeed.title,
            purpose: schoolNeed.purpose,
            requestedHelp: schoolNeed.requestedHelp,
            timeCommitment: schoolNeed.timeCommitment,
            timing: schoolNeed.timing,
            deadline: schoolNeed.deadline,
            locationMode: schoolNeed.locationMode,
            locationDetails: schoolNeed.locationDetails,
            staffContactUserId: schoolNeed.staffContactUserId,
            staffContactName: schoolNeed.staffContactName,
            participationTerms: schoolNeed.participationTerms,
            paidDetails: schoolNeed.paidDetails,
            initiativeLink: schoolNeed.initiativeLink,
          })
          .from(schoolNeed)
          .where(eq(schoolNeed.id, needId)),
        db
          .select({
            version: schoolNeedRevision.version,
            actorUserId: schoolNeedRevision.actorUserId,
            createdAt: schoolNeedRevision.createdAt,
          })
          .from(schoolNeedRevision)
          .where(eq(schoolNeedRevision.needId, needId))
          .orderBy(desc(schoolNeedRevision.version)),
        db
          .select({
            version: schoolNeedApproval.version,
            stage: schoolNeedApproval.stage,
            actorUserId: schoolNeedApproval.actorUserId,
            approvedAt: schoolNeedApproval.approvedAt,
          })
          .from(schoolNeedApproval)
          .where(eq(schoolNeedApproval.needId, needId))
          .orderBy(desc(schoolNeedApproval.version), schoolNeedApproval.stage),
      ]);
      const need = needs[0];
      if (!need) return null;
      const currentApprovals = approvals.filter((approval) => approval.version === need.version);
      const staffValidated = currentApprovals.some(
        (approval) => approval.stage === "staff-validation"
      );
      const coordinatorApproved = currentApprovals.some(
        (approval) => approval.stage === "directory-approval"
      );
      return {
        need: {
          ...need,
          staffValidated: !!staffValidated,
          coordinatorApproved: !!coordinatorApproved,
          status: coordinatorApproved
            ? ("approved" as const)
            : staffValidated
              ? ("awaiting-coordinator" as const)
              : ("awaiting-staff" as const),
        },
        revisions,
        approvals,
      };
    },
    async submit(input: NeedInput & { id: string; actorId: string; occurredAt: string }) {
      return await db.all<{ id: string }>(sql`
        INSERT INTO school_need(id,submitter_user_id,version,category,title,purpose,requested_help,
          time_commitment,timing,deadline,location_mode,location_details,staff_contact_user_id,
          staff_contact_name,
          participation_terms,paid_details,initiative_link,created_at,updated_at,updated_by)
        SELECT ${input.id},${input.actorId},1,${input.category},${input.title},${input.purpose},
          ${input.requestedHelp},${input.timeCommitment},${input.timing || null},${input.deadline},
          ${input.locationMode},${input.locationDetails},${input.staffContactUserId},
          COALESCE(NULLIF(trim(u.name),''),'Akun staf ' || substr(u.id,1,8)),
          ${input.participationTerms},${input.paidDetails},
          ${input.initiativeLink || null},
          ${input.occurredAt},${input.occurredAt},${input.actorId}
        FROM user u WHERE u.id=${input.staffContactUserId}
          AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${input.actorId}
          AND role IN('staff','student','directory-coordinator'))
          AND EXISTS(SELECT 1 FROM role_assignment r WHERE r.user_id=u.id AND r.role='staff')
          AND u.email_verified=1
        RETURNING id
      `);
    },
    async edit(
      input: NeedInput & {
        id: string;
        actorId: string;
        expectedVersion: number;
        occurredAt: string;
      }
    ) {
      return await db.all<{ id: string; version: number }>(sql`
        UPDATE school_need SET version=version+1,category=${input.category},title=${input.title},
          purpose=${input.purpose},requested_help=${input.requestedHelp},
          time_commitment=${input.timeCommitment},timing=${input.timing || null},
          deadline=${input.deadline},location_mode=${input.locationMode},
          location_details=${input.locationDetails},staff_contact_user_id=${input.staffContactUserId},
          staff_contact_name=(SELECT COALESCE(NULLIF(trim(name),''),'Akun staf ' || substr(id,1,8))
            FROM user WHERE id=${input.staffContactUserId}),
          participation_terms=${input.participationTerms},paid_details=${input.paidDetails},
          initiative_link=${input.initiativeLink || null},updated_at=${input.occurredAt},
          updated_by=${input.actorId}
        WHERE id=${input.id} AND submitter_user_id=${input.actorId} AND version=${input.expectedVersion}
          AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${input.actorId}
            AND role IN('staff','student','directory-coordinator'))
          AND EXISTS(SELECT 1 FROM role_assignment r JOIN user u ON u.id=r.user_id
            WHERE r.user_id=${input.staffContactUserId} AND r.role='staff'
              AND u.email_verified=1)
        RETURNING id,version
      `);
    },
    async approve(input: {
      needId: string;
      version: number;
      stage: "staff-validation" | "directory-approval";
      actorId: string;
      occurredAt: string;
    }) {
      return await db.all<{ needId: string }>(sql`
        INSERT INTO school_need_approval(need_id,version,stage,actor_user_id,approved_at)
        SELECT n.id,n.version,${input.stage},${input.actorId},${input.occurredAt}
        FROM school_need n
        WHERE n.id=${input.needId} AND n.version=${input.version}
          AND (( ${input.stage}='staff-validation'
            AND n.staff_contact_user_id=${input.actorId}
            AND EXISTS(SELECT 1 FROM role_assignment r JOIN user u ON u.id=r.user_id
              WHERE r.user_id=${input.actorId} AND r.role='staff'
                AND u.email_verified=1))
          OR ( ${input.stage}='directory-approval'
            AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${input.actorId}
              AND role='directory-coordinator')))
          AND NOT EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
            AND a.version=n.version AND a.stage=${input.stage})
          AND (${input.stage}!='directory-approval' OR EXISTS(
            SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
              AND a.version=n.version AND a.stage='staff-validation'))
          AND NOT EXISTS(SELECT 1 FROM school_need_approval a WHERE a.need_id=n.id
            AND a.version=n.version AND a.actor_user_id=${input.actorId})
        RETURNING need_id AS needId
      `);
    },
  };
}
