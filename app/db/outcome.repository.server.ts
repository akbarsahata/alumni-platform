import { and, asc, eq, sql } from "drizzle-orm";
import { database } from "./database.server";
import { outreachOutcome, outreachOutcomeEvent, outreachRequest } from "./schema";
import type { OutcomeActorKind, OutcomeEventKind, OutcomeState } from "../outreach/model";

const outcomeColumns = {
  requestId: outreachOutcome.requestId,
  revision: outreachOutcome.revision,
  state: outreachOutcome.state,
  introducedAt: outreachOutcome.introducedAt,
  updatedAt: outreachOutcome.updatedAt,
};
const eventColumns = {
  id: outreachOutcomeEvent.id,
  requestId: outreachOutcomeEvent.requestId,
  revision: outreachOutcomeEvent.revision,
  kind: outreachOutcomeEvent.kind,
  actorUserId: outreachOutcomeEvent.actorUserId,
  actorKind: outreachOutcomeEvent.actorKind,
  previousState: outreachOutcomeEvent.previousState,
  state: outreachOutcomeEvent.state,
  note: outreachOutcomeEvent.note,
  occurredAt: outreachOutcomeEvent.occurredAt,
};

export type OutreachOutcome = {
  requestId: string;
  revision: number;
  state: OutcomeState;
  introducedAt: string;
  updatedAt: string;
};
export type OutreachOutcomeEvent = {
  id: string;
  requestId: string;
  revision: number;
  kind: OutcomeEventKind;
  actorUserId: string;
  actorKind: OutcomeActorKind;
  previousState: OutcomeState;
  state: OutcomeState;
  note: string | null;
  occurredAt: string;
};

export function outcomeRepository(binding: D1Database) {
  const db = database(binding);
  const requestAccess = (requestId: string, actorId: string) =>
    and(
      eq(outreachRequest.id, requestId),
      sql`(${outreachRequest.recipientUserId}=${actorId} OR EXISTS(
        SELECT 1 FROM role_assignment
        WHERE user_id=${actorId} AND role='directory-coordinator'))`
    );
  const coordinatorAccess = (needId: string, actorId: string) =>
    and(
      eq(outreachRequest.needId, needId),
      sql`EXISTS(SELECT 1 FROM role_assignment
        WHERE user_id=${actorId} AND role='directory-coordinator')`
    );
  return {
    async forRequest(requestId: string, actorId: string) {
      const [current, events] = await db.batch([
        db
          .select(outcomeColumns)
          .from(outreachOutcome)
          .innerJoin(outreachRequest, eq(outreachRequest.id, outreachOutcome.requestId))
          .where(requestAccess(requestId, actorId)),
        db
          .select(eventColumns)
          .from(outreachOutcomeEvent)
          .innerJoin(outreachRequest, eq(outreachRequest.id, outreachOutcomeEvent.requestId))
          .where(requestAccess(requestId, actorId))
          .orderBy(asc(outreachOutcomeEvent.revision)),
      ]);
      return {
        current: current[0] as OutreachOutcome | undefined,
        events: events as OutreachOutcomeEvent[],
      };
    },
    async forNeed(needId: string, actorId: string) {
      const [current, events] = await db.batch([
        db
          .select(outcomeColumns)
          .from(outreachOutcome)
          .innerJoin(outreachRequest, eq(outreachRequest.id, outreachOutcome.requestId))
          .where(coordinatorAccess(needId, actorId)),
        db
          .select(eventColumns)
          .from(outreachOutcomeEvent)
          .innerJoin(outreachRequest, eq(outreachRequest.id, outreachOutcomeEvent.requestId))
          .where(coordinatorAccess(needId, actorId))
          .orderBy(asc(outreachOutcomeEvent.revision)),
      ]);
      return { current: current as OutreachOutcome[], events: events as OutreachOutcomeEvent[] };
    },
    async append(input: {
      id: string;
      requestId: string;
      actorId: string;
      actorKind: OutcomeActorKind;
      kind: OutcomeEventKind;
      expectedRevision: number;
      state: OutcomeState | null;
      note: string | null;
    }) {
      return (
        await db.all<{ revision: number; state: OutcomeState; occurredAt: string }>(sql`
          INSERT INTO outreach_outcome_event(id,request_id,revision,kind,actor_user_id,
            actor_kind,previous_state,state,note)
          SELECT ${input.id},o.request_id,o.revision+1,${input.kind},${input.actorId},
            ${input.actorKind},o.state,
            CASE WHEN ${input.kind}='confirm' THEN o.state ELSE ${input.state} END,
            CASE WHEN ${input.kind}='confirm' THEN NULL ELSE ${input.note} END
          FROM outreach_request r
          JOIN outreach_outcome o ON o.request_id=r.id
          WHERE r.id=${input.requestId}
            AND o.revision=${input.expectedRevision}
            AND r.status='interested'
            AND EXISTS(SELECT 1 FROM outreach_introduction i
              WHERE i.request_id=r.id AND i.shared_at IS NOT NULL)
            AND EXISTS(SELECT 1 FROM user u
              WHERE u.id=${input.actorId} AND u.email_verified=1)
            AND (
              (${input.actorKind}='coordinator' AND ${input.kind}='record'
                AND EXISTS(SELECT 1 FROM role_assignment ra
                  WHERE ra.user_id=${input.actorId} AND ra.role='directory-coordinator'))
              OR (${input.actorKind}='member' AND ${input.kind} IN('confirm','correct')
                AND r.recipient_user_id=${input.actorId}
                AND EXISTS(SELECT 1 FROM alumni_membership m
                  WHERE m.user_id=${input.actorId} AND m.status='approved'))
            )
          RETURNING revision,state,occurred_at AS occurredAt`)
      )[0];
    },
  };
}
