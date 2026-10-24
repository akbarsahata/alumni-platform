import { test } from "node:test";
import assert from "node:assert/strict";
import { EmailDeliveryError, sendWithResend } from "../app/email/resend.server.ts";
import { deliverIntroductionAttempt } from "../app/outreach/introduction-delivery.ts";

const config = {
  apiKey: "re_test_key",
  from: "iam@akbarsahata.id",
  replyTo: "iam@akbarsahata.id",
};
const message = {
  to: "member@example.test",
  subject: "Perkenalan alumni",
  text: "Isi pesan perkenalan.",
};

test("Resend adapter sends the configured message and idempotency key", async () => {
  let request;
  const result = await sendWithResend(config, message, "outreach-introduction:intro-1", {
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    },
  });

  assert.equal(result.messageId, "email_1");
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.init.headers["Idempotency-Key"], "outreach-introduction:intro-1");
  assert.deepEqual(JSON.parse(request.init.body), {
    from: "iam@akbarsahata.id",
    to: "member@example.test",
    subject: "Perkenalan alumni",
    text: "Isi pesan perkenalan.",
    reply_to: "iam@akbarsahata.id",
  });
});

test("Resend adapter returns a sanitized definite error for a provider failure", async () => {
  await assert.rejects(
    sendWithResend(config, message, undefined, {
      fetchImpl: async () =>
        new Response("provider body with member@example.test", { status: 500 }),
    }),
    (error) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.equal(error.message, "Email delivery failed");
      assert.equal(error.ambiguous, false);
      assert.doesNotMatch(error.message, /member@example\.test|provider body/);
      return true;
    }
  );
});

test("Resend adapter marks timeout and transport failures ambiguous", async () => {
  await assert.rejects(
    sendWithResend(config, message, undefined, {
      timeoutMs: 20,
      fetchImpl: (_, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    }),
    (error) => error instanceof EmailDeliveryError && error.ambiguous
  );
});

test("Resend adapter fails closed when configuration is missing", async () => {
  let called = false;
  await assert.rejects(
    sendWithResend({ apiKey: "", from: "", replyTo: "" }, message, undefined, {
      fetchImpl: async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
    }),
    (error) => error instanceof EmailDeliveryError && !error.ambiguous
  );
  assert.equal(called, false);
});

function introductionFixture({
  claim = { id: "intro-1", action: "send", staffEmail: null, memberEmail: null },
  sendMode = "resend",
  confirm = true,
  markShared = true,
} = {}) {
  const calls = [];
  const repository = {
    async reconcile() {
      calls.push("reconcile");
    },
    async beginIntroductionDelivery() {
      calls.push("begin");
      return claim;
    },
    async introductionDelivery() {
      calls.push("delivery");
      return {
        staffEmail: "staff@example.test",
        staffName: "Staf Sekolah",
        memberEmail: "member@example.test",
        memberName: "Alumni",
        title: "Mentor robotika",
        purpose: "Mendukung kelas robotika",
        requestedHelp: "Menjadi mentor",
      };
    },
    async confirmIntroductionDelivery() {
      calls.push("confirm");
      return confirm;
    },
    async markIntroductionAccepted(id, providerMessageId) {
      calls.push(["accepted", id, providerMessageId]);
      return true;
    },
    async markIntroductionFailed(id) {
      calls.push(["failed", id]);
      return true;
    },
    async markIntroductionAmbiguous(id) {
      calls.push(["ambiguous", id]);
      return true;
    },
    async markIntroductionShared(id, staffEmail) {
      calls.push(["shared", id, staffEmail]);
      return markShared;
    },
    async captureIntroduction() {
      calls.push("capture");
      return true;
    },
    async releaseIntroduction(id) {
      calls.push(["release", id]);
    },
    async hasPendingIntroduction() {
      return false;
    },
  };
  const send = async (outgoing, options) => {
    calls.push(["send", outgoing, options.idempotencyKey]);
    if (sendMode === "definite") throw new EmailDeliveryError();
    if (sendMode === "ambiguous") throw new EmailDeliveryError(true);
    if (sendMode === "local") {
      await options.localCapture();
      return { delivered: true, transport: "local" };
    }
    return { delivered: true, transport: "resend", messageId: "mock-1" };
  };
  return { calls, repository, send };
}

function runIntroduction(fixture, provider = true) {
  return deliverIntroductionAttempt({
    requestId: "request-1",
    initiatingCoordinatorId: "coordinator-1",
    now: "2026-10-24T10:00:00.000Z",
    provider,
    repository: fixture.repository,
    send: fixture.send,
  });
}

test("provider acceptance records an accepted attempt and sharing evidence", async () => {
  const fixture = introductionFixture();
  const result = await runIntroduction(fixture);
  assert.deepEqual(result, { shared: true, pending: false, attention: false });
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "accepted"));
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "shared"));
});

test("definite provider failure releases a retryable introduction", async () => {
  const fixture = introductionFixture({ sendMode: "definite" });
  const result = await runIntroduction(fixture);
  assert.deepEqual(result, { shared: false, pending: false, attention: false });
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "failed"));
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "release"));
});

test("ambiguous provider outcome requires reconciliation and does not release", async () => {
  const fixture = introductionFixture({ sendMode: "ambiguous" });
  const result = await runIntroduction(fixture);
  assert.deepEqual(result, { shared: false, pending: false, attention: true });
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "ambiguous"));
  assert.ok(!fixture.calls.some((call) => Array.isArray(call) && call[0] === "release"));
});

test("an accepted attempt is reconciled without another provider send", async () => {
  const fixture = introductionFixture({
    claim: {
      id: "intro-1",
      action: "evidence",
      staffEmail: "staff@example.test",
      memberEmail: "member@example.test",
      providerMessageId: "mock-1",
    },
  });
  const result = await runIntroduction(fixture);
  assert.deepEqual(result, { shared: true, pending: false, attention: false });
  assert.ok(!fixture.calls.some((call) => Array.isArray(call) && call[0] === "send"));
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "shared"));
});

test("a blocked attempt is exposed for operator attention", async () => {
  const fixture = introductionFixture({ claim: { id: "intro-1", action: "blocked" } });
  const result = await runIntroduction(fixture);
  assert.deepEqual(result, { shared: false, pending: false, attention: true });
  assert.ok(!fixture.calls.some((call) => Array.isArray(call) && call[0] === "send"));
});

test("local capture keeps the atomic D1 mailbox path", async () => {
  const fixture = introductionFixture({ sendMode: "local" });
  const result = await runIntroduction(fixture, false);
  assert.deepEqual(result, { shared: true, pending: false, attention: false });
  assert.ok(fixture.calls.includes("capture"));
  assert.ok(!fixture.calls.some((call) => Array.isArray(call) && call[0] === "confirm"));
});
