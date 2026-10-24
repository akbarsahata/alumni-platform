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
  await sendWithResend(config, message, "outreach-introduction:intro-1", {
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    },
  });

  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, "Bearer re_test_key");
  assert.equal(request.init.headers["Content-Type"], "application/json");
  assert.equal(request.init.headers["Idempotency-Key"], "outreach-introduction:intro-1");
  assert.deepEqual(JSON.parse(request.init.body), {
    from: "iam@akbarsahata.id",
    to: "member@example.test",
    subject: "Perkenalan alumni",
    text: "Isi pesan perkenalan.",
    reply_to: "iam@akbarsahata.id",
  });
});

test("Resend adapter omits the idempotency header when no key is provided", async () => {
  let headers;
  await sendWithResend(config, message, undefined, {
    fetchImpl: async (_, init) => {
      headers = init.headers;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(headers["Idempotency-Key"], undefined);
});

test("Resend adapter returns a sanitized error for a provider failure", async () => {
  await assert.rejects(
    sendWithResend(config, message, undefined, {
      fetchImpl: async () =>
        new Response("provider body with member@example.test", { status: 500 }),
    }),
    (error) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.equal(error.message, "Email delivery failed");
      assert.doesNotMatch(error.message, /member@example\.test|provider body/);
      return true;
    }
  );
});

test("Resend adapter returns a sanitized error after a bounded timeout", async () => {
  await assert.rejects(
    sendWithResend(config, message, undefined, {
      timeoutMs: 20,
      fetchImpl: (_, init) =>
        new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    }),
    EmailDeliveryError
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
    EmailDeliveryError
  );
  assert.equal(called, false);
});

function introductionFixture({
  sendMode = "resend",
  captureResult = true,
  markResult = true,
  pending = false,
} = {}) {
  const calls = [];
  const repository = {
    async reconcile() {
      calls.push("reconcile");
    },
    async claimIntroduction(requestId, now, coordinatorId) {
      calls.push(["claim", requestId, now, coordinatorId]);
      return { id: "intro-1" };
    },
    async introductionDelivery(id) {
      calls.push(["delivery", id]);
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
    async captureIntroduction(id, capturedMessage, coordinatorId) {
      calls.push(["capture", id, capturedMessage.to, coordinatorId]);
      return captureResult;
    },
    async markIntroductionShared(id, sharedMessage, coordinatorId) {
      calls.push(["mark", id, sharedMessage.to, coordinatorId]);
      if (markResult === "throw") throw new Error("database unavailable");
      return markResult;
    },
    async releaseIntroduction(id) {
      calls.push(["release", id]);
    },
    async hasPendingIntroduction(requestId) {
      calls.push(["pending", requestId]);
      return pending;
    },
  };
  const send = async (outgoing, options) => {
    calls.push(["send", outgoing, options.idempotencyKey]);
    if (sendMode === "throw") throw new Error("provider unavailable");
    if (sendMode === "local") {
      const delivered = await options.localCapture();
      return { delivered, transport: "local" };
    }
    return { delivered: true, transport: "resend" };
  };
  return { calls, repository, send };
}

function runIntroduction(fixture) {
  return deliverIntroductionAttempt({
    requestId: "request-1",
    initiatingCoordinatorId: "coordinator-1",
    now: "2026-10-24T10:00:00.000Z",
    repository: fixture.repository,
    send: fixture.send,
  });
}

test("provider acceptance records introduction sharing evidence", async () => {
  const fixture = introductionFixture();
  const result = await runIntroduction(fixture);

  assert.deepEqual(result, { shared: true, pending: false });
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "mark"));
  assert.ok(!fixture.calls.some((call) => Array.isArray(call) && call[0] === "capture"));
  const sendCall = fixture.calls.find((call) => Array.isArray(call) && call[0] === "send");
  assert.equal(sendCall[2], "outreach-introduction:intro-1");
  assert.match(sendCall[1].text, /member@example\.test/);
  assert.match(sendCall[1].text, /Mentor robotika/);
});

test("provider failure leaves the introduction retryable and unshared", async () => {
  const fixture = introductionFixture({ sendMode: "throw", pending: true });
  const result = await runIntroduction(fixture);

  assert.deepEqual(result, { shared: false, pending: true });
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "release"));
  assert.ok(!fixture.calls.some((call) => Array.isArray(call) && call[0] === "mark"));
});

test("sharing evidence failure releases the claimed introduction", async () => {
  const fixture = introductionFixture({ markResult: false, pending: true });
  const result = await runIntroduction(fixture);

  assert.deepEqual(result, { shared: false, pending: true });
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "mark"));
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "release"));
});

test("a sharing evidence exception releases the claimed introduction", async () => {
  const fixture = introductionFixture({ markResult: "throw", pending: true });
  const result = await runIntroduction(fixture);

  assert.deepEqual(result, { shared: false, pending: true });
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "mark"));
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "release"));
});

test("local capture keeps the atomic D1 mailbox path", async () => {
  const fixture = introductionFixture({ sendMode: "local" });
  const result = await runIntroduction(fixture);

  assert.deepEqual(result, { shared: true, pending: false });
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "capture"));
  assert.ok(!fixture.calls.some((call) => Array.isArray(call) && call[0] === "mark"));
});

test("local capture refusal releases the claimed introduction", async () => {
  const fixture = introductionFixture({
    sendMode: "local",
    captureResult: false,
    pending: true,
  });
  const result = await runIntroduction(fixture);

  assert.deepEqual(result, { shared: false, pending: true });
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "capture"));
  assert.ok(fixture.calls.some((call) => Array.isArray(call) && call[0] === "release"));
  assert.ok(!fixture.calls.some((call) => Array.isArray(call) && call[0] === "mark"));
});
