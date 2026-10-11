import assert from "node:assert/strict";
import { after, test } from "node:test";
import { writeFile } from "node:fs/promises";
import { call, login } from "./helpers/accounts.mjs";
import { membershipReviewers } from "./helpers/membership.mjs";

const endpoint = "/api/school-needs";
const details = {
  category: "student-mentoring",
  title: "Pendampingan robotika",
  purpose: "Mendampingi siswa menyiapkan klub robotika sekolah.",
  requestedHelp: "Keahlian robotika dan mentoring siswa.",
  timeCommitment: "Dua jam setiap pekan selama satu bulan.",
  timing: "Mulai bulan depan",
  deadline: null,
  locationMode: "remote",
  locationDetails: "",
  staffContactUserId: "",
  participationTerms: "voluntary",
  paidDetails: "",
  initiativeLink: "",
};

async function assign(account, role, primary) {
  assert.equal(
    (
      await call(primary, "/api/admin/roles", {
        targetUserId: account.id,
        role,
        action: "grant",
        reason: `School needs test ${role}`,
      })
    ).status,
    200
  );
}

async function schoolActor(label, role, primary) {
  const account = await login(label);
  await assign(account, role, primary);
  return account;
}

async function submit(student, staff, input = {}) {
  return await call(student, endpoint, {
    ...details,
    staffContactUserId: staff.id,
    ...input,
  });
}

test("school roles submit complete needs without alumni profiles and private projections stay scoped", async () => {
  const { primary } = await membershipReviewers();
  const student = await schoolActor("need-owner", "student", primary);
  const staff = await schoolActor("need-contact", "staff", primary);
  const unrelatedStudent = await schoolActor("need-unrelated", "student", primary);
  const otherStaff = await schoolActor("need-other-staff", "staff", primary);
  const coordinator = await schoolActor("need-coordinator", "directory-coordinator", primary);

  assert.equal((await call(student, "/api/profile")).status, 403);
  assert.equal((await call(student, "/profile")).status, 403);
  assert.equal((await call(primary, endpoint, details)).status, 403);
  assert.equal(
    (
      await call(
        student,
        endpoint,
        { ...details, staffContactUserId: staff.id },
        {
          Origin: "https://attacker.example",
        }
      )
    ).status,
    403
  );

  const valid = { ...details, staffContactUserId: staff.id };
  assert.deepEqual((await (await call(student, "/api/access")).json()).roles, ["student"]);
  const contacts = await (await call(student, endpoint)).json();
  assert.ok(
    contacts.staffContacts.some((contact) => contact.id === staff.id),
    JSON.stringify({ contacts, access: await (await call(staff, "/api/access")).json() })
  );
  for (const invalid of [
    { category: undefined },
    { category: "jobs" },
    { title: "  " },
    { purpose: undefined },
    { requestedHelp: "" },
    { timeCommitment: undefined },
    { timing: "", deadline: null },
    { locationMode: undefined },
    { locationMode: "on-site", locationDetails: "" },
    { staffContactUserId: undefined },
    { participationTerms: undefined },
    { participationTerms: "paid", paidDetails: "" },
    { deadline: "2026-02-30" },
  ]) {
    assert.equal((await call(student, endpoint, { ...valid, ...invalid })).status, 400);
  }
  assert.equal(
    (await call(student, endpoint, { ...valid, staffContactUserId: primary.id })).status,
    409
  );
  for (const forged of [{ actorUserId: primary.id }, { role: "directory-coordinator" }]) {
    assert.equal((await call(student, endpoint, { ...valid, ...forged })).status, 400);
  }

  const response = await submit(student, staff, {
    category: "school-activity",
    initiativeLink: "https://school.example/initiative",
  });
  const result = await response.text();
  assert.equal(response.status, 200, result);
  const { needId } = JSON.parse(result);
  assert.ok(needId);

  assert.equal(
    (await call(student, endpoint, { ...valid, staffContactName: "Nama yang dipalsukan" })).status,
    400
  );
  for (const [path, body] of [
    [`${endpoint}/${needId}/edit`, { ...valid, expectedVersion: 1 }],
    [`${endpoint}/${needId}/validate`, { expectedVersion: 1 }],
    [`${endpoint}/${needId}/approve`, { expectedVersion: 1 }],
  ]) {
    assert.equal(
      (
        await call(student, path, body, {
          Origin: "https://attacker.example",
        })
      ).status,
      403
    );
  }

  const ownResponse = await call(student, endpoint);
  assert.equal(ownResponse.headers.get("cache-control"), "no-store");
  const own = await ownResponse.json();
  assert.equal(own.ownNeeds.length, 1);
  assert.equal(own.ownNeeds[0].title, "Pendampingan robotika");
  assert.equal(own.ownNeeds[0].status, "awaiting-staff");
  assert.ok(own.staffContacts.some((contact) => contact.id === staff.id));
  assert.doesNotMatch(JSON.stringify(own), new RegExp(staff.email));
  const ownDetail = await call(student, `/api/school-needs/${needId}`);
  assert.equal(ownDetail.status, 200);
  const ownNeed = await ownDetail.json();
  assert.equal(
    ownNeed.need.staffContactName,
    own.staffContacts.find((contact) => contact.id === staff.id).name
  );
  assert.doesNotMatch(JSON.stringify(ownNeed), new RegExp(staff.email));
  assert.equal((await call(unrelatedStudent, endpoint)).status, 200);
  assert.equal((await call(unrelatedStudent, `/api/school-needs/${needId}`)).status, 404);
  assert.equal((await call(otherStaff, `/api/school-needs/${needId}`)).status, 404);
  assert.equal((await call(coordinator, `/api/school-needs/${needId}`)).status, 404);
  const privatePage = await call(unrelatedStudent, `/school-needs/${needId}`);
  assert.equal(privatePage.status, 404);
  assert.equal(privatePage.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await privatePage.text(), /Pendampingan robotika/);
  const ownDataRoute = await call(student, "/school-needs.data");
  assert.equal(ownDataRoute.status, 200);
  assert.equal(ownDataRoute.headers.get("cache-control"), "no-store");
  assert.match(await ownDataRoute.text(), /Pendampingan robotika/);
  for (const actor of [unrelatedStudent, otherStaff]) {
    for (const path of [`/school-needs/${needId}`, `/school-needs/${needId}.data`]) {
      const denied = await call(actor, path);
      assert.equal(denied.status, 404);
      assert.equal(denied.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(await denied.text(), /Pendampingan robotika/);
    }
  }
  for (const actor of [null, primary]) {
    const denied = await call(actor, "/api/school-needs/invalid/validate", {
      expectedVersion: 1,
    });
    assert.equal(denied.status, actor ? 403 : 401);
    assert.equal(denied.headers.get("cache-control"), "no-store");
    for (const path of ["/school-needs", "/school-needs.data"]) {
      const deniedPage = await call(actor, path);
      assert.equal(deniedPage.status, actor ? 403 : 401);
      assert.equal(deniedPage.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(await deniedPage.text(), /Pendampingan robotika/);
    }
  }
});

test("staff validation and directory approval are independent, current-version, and retained across edits", async () => {
  const { primary } = await membershipReviewers();
  const student = await schoolActor("need-approval-owner", "student", primary);
  const staff = await schoolActor("need-approval-staff", "staff", primary);
  const coordinator = await schoolActor(
    "need-approval-coordinator",
    "directory-coordinator",
    primary
  );
  await assign(staff, "directory-coordinator", primary);
  const response = await submit(student, staff);
  assert.equal(response.status, 200);
  const { needId } = await response.json();
  const staffQueue = await (await call(staff, endpoint)).json();
  assert.ok(staffQueue.staffQueue.some((need) => need.id === needId));
  assert.equal((await (await call(coordinator, endpoint)).json()).coordinatorQueue.length, 0);

  assert.equal(
    (await call(coordinator, `${endpoint}/${needId}/approve`, { expectedVersion: 1 })).status,
    409
  );
  assert.equal(
    (
      await call(staff, `${endpoint}/${needId}/validate`, {
        expectedVersion: 2,
      })
    ).status,
    409
  );
  assert.equal(
    (
      await call(staff, `${endpoint}/${needId}/validate`, {
        expectedVersion: 1,
        actorUserId: coordinator.id,
      })
    ).status,
    400
  );
  const validations = await Promise.all([
    call(staff, `${endpoint}/${needId}/validate`, { expectedVersion: 1 }),
    call(staff, `${endpoint}/${needId}/validate`, { expectedVersion: 1 }),
  ]);
  assert.deepEqual(validations.map((result) => result.status).sort(), [200, 409]);

  const staffView = await (await call(staff, `${endpoint}/${needId}`)).json();
  assert.equal(staffView.need.status, "awaiting-coordinator");
  assert.equal(staffView.access.canApprove, false);
  assert.equal(
    (await call(staff, `${endpoint}/${needId}/approve`, { expectedVersion: 1 })).status,
    409
  );
  assert.equal(
    (await call(coordinator, `${endpoint}/${needId}/approve`, { expectedVersion: 2 })).status,
    409
  );
  assert.equal(
    (
      await call(coordinator, `${endpoint}/${needId}/approve`, {
        expectedVersion: 1,
      })
    ).status,
    200
  );
  let current = await (await call(student, `${endpoint}/${needId}`)).json();
  assert.equal(current.need.status, "approved");
  assert.equal(current.approvals.length, 2);
  assert.ok(current.approvals.every((approval) => !("actorUserId" in approval)));
  assert.equal((await call(coordinator, `${endpoint}/${needId}`)).status, 200);
  assert.equal(
    (await (await call(coordinator, `${endpoint}/${needId}`)).json()).need.status,
    "approved"
  );

  assert.equal(
    (
      await call(student, `${endpoint}/${needId}/edit`, {
        ...details,
        staffContactUserId: staff.id,
        title: "Pendampingan robotika revisi",
        expectedVersion: 1,
      })
    ).status,
    200
  );
  assert.equal(
    (
      await call(student, `${endpoint}/${needId}/edit`, {
        ...details,
        staffContactUserId: staff.id,
        title: "Perubahan usang",
        expectedVersion: 1,
      })
    ).status,
    409
  );
  current = await (await call(student, `${endpoint}/${needId}`)).json();
  assert.equal(current.need.version, 2);
  assert.equal(current.need.status, "awaiting-staff");
  assert.equal(current.need.staffValidated, false);
  assert.equal(current.need.coordinatorApproved, false);
  assert.deepEqual(
    current.approvals.map((approval) => approval.version),
    [1, 1]
  );
  assert.equal((await call(coordinator, `${endpoint}/${needId}`)).status, 404);
  assert.equal(
    (await call(staff, `${endpoint}/${needId}/validate`, { expectedVersion: 2 })).status,
    200
  );
  assert.equal(
    (await call(coordinator, `${endpoint}/${needId}/approve`, { expectedVersion: 2 })).status,
    200
  );
  current = await (await call(student, `${endpoint}/${needId}`)).json();
  assert.equal(current.need.status, "approved");
  assert.equal(current.revisions.length, 2);
});

test("staff and directory coordinators may submit needs; coordinator-created needs still require staff validation", async () => {
  const { primary } = await membershipReviewers();
  const staffSubmitter = await schoolActor("need-staff-submitter", "staff", primary);
  const staffContact = await schoolActor("need-coordinator-contact", "staff", primary);
  const coordinator = await schoolActor(
    "need-coordinator-submitter",
    "directory-coordinator",
    primary
  );
  const staffSubmission = await submit(staffSubmitter, staffContact, {
    title: "Kegiatan sekolah oleh staf",
    participationTerms: "paid",
    paidDetails: "Kompensasi disepakati bersama.",
  });
  assert.equal(staffSubmission.status, 200);

  const coordinatorSubmission = await submit(coordinator, staffContact, {
    category: "school-activity",
    title: "Kebutuhan yang dibuat koordinator",
    timing: "",
    deadline: "2026-12-01",
    locationMode: "on-site",
    locationDetails: "Laboratorium sekolah",
  });
  assert.equal(coordinatorSubmission.status, 200);
  const { needId } = await coordinatorSubmission.json();
  assert.equal(
    (await call(coordinator, `${endpoint}/${needId}/approve`, { expectedVersion: 1 })).status,
    409
  );
  assert.equal(
    (await (await call(coordinator, endpoint)).json()).coordinatorQueue.some(
      (need) => need.id === needId
    ),
    false
  );
  assert.equal(
    (await call(staffContact, `${endpoint}/${needId}/validate`, { expectedVersion: 1 })).status,
    200
  );
  assert.equal(
    (await (await call(coordinator, endpoint)).json()).coordinatorQueue.some(
      (need) => need.id === needId
    ),
    true
  );
  assert.equal(
    (await call(coordinator, `${endpoint}/${needId}/approve`, { expectedVersion: 1 })).status,
    200
  );
});

test("same-session role revocation immediately blocks school need reads and writes", async () => {
  const { primary } = await membershipReviewers();
  const student = await schoolActor("need-revoked-owner", "student", primary);
  const staff = await schoolActor("need-revoked-staff", "staff", primary);
  const response = await submit(student, staff);
  assert.equal(response.status, 200);
  const { needId } = await response.json();
  assert.equal(
    (
      await call(primary, "/api/admin/roles", {
        targetUserId: staff.id,
        role: "staff",
        action: "revoke",
        reason: "Role term ended",
      })
    ).status,
    200
  );
  assert.equal(
    (await call(staff, `${endpoint}/${needId}/validate`, { expectedVersion: 1 })).status,
    403
  );
  assert.equal((await call(staff, `/school-needs/${needId}`)).status, 403);
  assert.equal(
    (
      await call(primary, "/api/admin/roles", {
        targetUserId: student.id,
        role: "student",
        action: "revoke",
        reason: "Role term ended",
      })
    ).status,
    200
  );
  assert.equal((await call(student, endpoint)).status, 403);
  assert.equal(
    (
      await call(student, `${endpoint}/${needId}/edit`, {
        ...details,
        staffContactUserId: staff.id,
        expectedVersion: 1,
      })
    ).status,
    403
  );
});

test("submitted needs and both review queues expose every page through cursors", async () => {
  const { primary } = await membershipReviewers();
  const student = await schoolActor("need-pagination-owner", "student", primary);
  const staff = await schoolActor("need-pagination-staff", "staff", primary);
  const coordinator = await schoolActor(
    "need-pagination-coordinator",
    "directory-coordinator",
    primary
  );
  const needIds = [];

  for (let index = 0; index < 101; index++) {
    const response = await submit(student, staff, { title: `Kebutuhan halaman ${index}` });
    assert.equal(response.status, 200);
    needIds.push((await response.json()).needId);
  }

  assert.equal((await call(student, `${endpoint}?ownAfter=invalid`)).status, 400);

  const readPages = async (account, param, field, nextCursorField) => {
    const first = await (await call(account, endpoint)).json();
    assert.equal(first[field].length, 100);
    assert.ok(first[nextCursorField]);
    const second = await (
      await call(account, `${endpoint}?${param}=${encodeURIComponent(first[nextCursorField])}`)
    ).json();
    assert.equal(second[field].length, 1);
    assert.equal(second[nextCursorField], null);
    assert.equal(new Set([...first[field], ...second[field]].map((need) => need.id)).size, 101);
    assert.deepEqual(
      new Set([...first[field], ...second[field]].map((need) => need.id)),
      new Set(needIds)
    );
    return first[nextCursorField];
  };

  const ownCursor = await readPages(student, "ownAfter", "ownNeeds", "ownNeedsNextCursor");
  const ownPage = await (await call(student, "/school-needs")).text();
  assert.match(ownPage, /Halaman berikutnya/);
  assert.match(ownPage, /ownAfter/);
  assert.ok(ownCursor);

  const staffCursor = await readPages(staff, "staffAfter", "staffQueue", "staffQueueNextCursor");
  const staffPage = await (await call(staff, "/school-needs")).text();
  assert.match(staffPage, /Halaman berikutnya/);
  assert.match(staffPage, /staffAfter/);
  assert.ok(staffCursor);

  for (const needId of needIds) {
    const response = await call(staff, `${endpoint}/${needId}/validate`, { expectedVersion: 1 });
    assert.equal(response.status, 200);
  }

  const coordinatorCursor = await readPages(
    coordinator,
    "coordinatorAfter",
    "coordinatorQueue",
    "coordinatorQueueNextCursor"
  );
  const coordinatorPage = await (await call(coordinator, "/school-needs")).text();
  assert.match(coordinatorPage, /Halaman berikutnya/);
  assert.match(coordinatorPage, /coordinatorAfter/);
  assert.ok(coordinatorCursor);
});

after(async () => {
  const { primary } = await membershipReviewers();
  const student = await schoolActor("browser-need-student", "student", primary);
  const staff = await schoolActor("browser-need-staff", "staff", primary);
  const coordinator = await schoolActor(
    "browser-need-coordinator",
    "directory-coordinator",
    primary
  );
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/school-needs-accounts.json`,
    JSON.stringify({ student, staff, coordinator }),
    { mode: 0o600 }
  );
});
