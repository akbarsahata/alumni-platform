import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { login, call } from "./accounts.mjs";

let reviewers;
export async function membershipReviewers() {
  if (reviewers) return reviewers;
  let primary;
  try {
    primary = JSON.parse(
      await readFile(`${process.env.ALUMNI_TEST_STATE}/accounts.json`, "utf8")
    ).primary;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    primary = await login("membership-primary");
    const file = `${process.env.ALUMNI_TEST_STATE}/membership-bootstrap.json`;
    await writeFile(
      file,
      JSON.stringify({
        primaryUserId: primary.id,
        operator: "Synthetic membership operator",
        reason: "Local review test appointment",
        trustedAlumni: [],
      }),
      { mode: 0o600 }
    );
    execFileSync(process.execPath, ["scripts/bootstrap.mjs", file], { stdio: "pipe" });
  }
  const reviewer = await login("membership-reviewer");
  assert.equal(
    (
      await call(primary, "/api/admin/roles", {
        targetUserId: reviewer.id,
        role: "membership-administrator",
        action: "grant",
        reason: "Independent synthetic membership reviewer",
      })
    ).status,
    200
  );
  reviewers = { primary, reviewer };
  return reviewers;
}

export const application = {
  expectedRevision: 0,
  schoolName: "Nama semasa sekolah",
  studentType: "graduate",
  graduationYear: 2008,
  house: "Komodo",
  explanation: "Referensi belum terdaftar; mohon pemeriksaan melalui alumni tepercaya.",
};
export const decision = {
  expectedRevision: 1,
  outcome: "approved",
  reason: "Pemeriksaan identitas sekolah selesai",
  applicantMessage: "Identitas sekolah telah diperiksa. Lihat status pengajuan Anda.",
  checkSource: "trusted-alumnus",
  checkNote: "Alumni tepercaya mengonfirmasi nama sekolah dan house secara independen.",
};
