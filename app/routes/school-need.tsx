import { env } from "cloudflare:workers";
import { useEffect } from "react";
import { Form, Link, data, useNavigation } from "react-router";
import { Toaster, toast } from "sonner";
import type { Route } from "./+types/school-need";
import { pageTitle } from "../content/page-title";
import { LocalTimestamp } from "../components/local-timestamp";
import { needCategoryLabels, locationModeLabels, needStatusLabels } from "../school-needs/model";
import { outcomeStateLabels } from "../outreach/model";
import { SchoolNeedFormFields } from "../school-needs/form-fields";
import { useSchoolNeedFormValidation } from "../school-needs/use-form-validation";
import { formatTimeCommitment, formatTimingRange } from "../school-needs/payload";
import { schoolNeedFormInput } from "../school-needs/form-input";
import {
  approveSchoolNeed,
  editSchoolNeed,
  readSchoolNeed,
  validateSchoolNeed,
} from "../school-needs/school-needs.server";

export function meta() {
  return [{ title: pageTitle("Kebutuhan sekolah") }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return await readSchoolNeed(request, env, params.needId!);
}

export async function action({ request, params }: Route.ActionArgs) {
  const needId = params.needId!;
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    if (intent === "edit") await editSchoolNeed(request, env, needId, schoolNeedFormInput(form));
    else if (intent === "validate")
      await validateSchoolNeed(request, env, needId, {
        expectedVersion: form.get("expectedVersion"),
      });
    else if (intent === "approve")
      await approveSchoolNeed(request, env, needId, {
        expectedVersion: form.get("expectedVersion"),
      });
    else return data({ error: "Tindakan kebutuhan tidak valid.", message: null }, { status: 400 });
    return { error: null, message: "Status kebutuhan sekolah berhasil diperbarui." };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 403, 404, 409].includes(error.status)) throw error;
    return data({ error: await error.text(), message: null }, { status: error.status });
  }
}

export default function SchoolNeed({ loaderData, actionData }: Route.ComponentProps) {
  const { need, access, revisions, approvals } = loaderData;
  const busy = useNavigation().state !== "idle";
  const { errors, formProps } = useSchoolNeedFormValidation();
  useEffect(() => {
    if (actionData?.message)
      toast.success(actionData.message, {
        id: "school-need-feedback",
        toasterId: "school-needs",
      });
    else if (actionData?.error)
      toast.error(actionData.error, {
        id: "school-need-feedback",
        toasterId: "school-needs",
      });
  }, [actionData]);
  return (
    <>
      <Toaster
        id="school-needs"
        position="top-center"
        offset={{ top: "80px" }}
        mobileOffset={{ top: "128px" }}
        richColors
        closeButton
        duration={6000}
        containerAriaLabel="Pemberitahuan kebutuhan sekolah"
        toastOptions={{ closeButtonAriaLabel: "Tutup pemberitahuan" }}
      />
      <main className="mx-auto max-w-3xl space-y-6">
        <Link to="/school-needs">← Kebutuhan sekolah</Link>
        <h1 className="text-2xl font-semibold">{need.title}</h1>
        <p role="status">{needStatusLabels[need.status]}</p>
        {actionData?.error && <p role="alert">{actionData.error}</p>}
        {actionData?.message && <p role="status">{actionData.message}</p>}
        <dl className="space-y-3">
          <div>
            <dt className="font-semibold">Jenis kebutuhan</dt>
            <dd>{needCategoryLabels[need.category]}</dd>
          </div>
          <div>
            <dt className="font-semibold">Tujuan sekolah</dt>
            <dd>{need.purpose}</dd>
          </div>
          <div>
            <dt className="font-semibold">Keahlian atau bantuan</dt>
            <dd>{need.requestedHelp}</dd>
          </div>
          <div>
            <dt className="font-semibold">Komitmen waktu</dt>
            <dd>{formatTimeCommitment(need.timeCommitment)}</dd>
          </div>
          <div>
            <dt className="font-semibold">Waktu pelaksanaan</dt>
            <dd>{formatTimingRange(need.timing, need.deadline)}</dd>
          </div>
          <div>
            <dt className="font-semibold">Lokasi</dt>
            <dd>
              {locationModeLabels[need.locationMode]}{" "}
              {need.locationDetails ? `· ${need.locationDetails}` : ""}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Kontak staf terverifikasi</dt>
            <dd>{need.staffContactName}</dd>
          </div>
          <div>
            <dt className="font-semibold">Ketentuan partisipasi</dt>
            <dd>
              {need.participationTerms === "voluntary" ? "Sukarela" : "Berbayar"}
              {need.paidDetails ? ` · ${need.paidDetails}` : ""}
            </dd>
          </div>
          {need.initiativeLink && (
            <div>
              <dt className="font-semibold">Tautan inisiatif</dt>
              <dd>
                <a href={need.initiativeLink} target="_blank" rel="noreferrer">
                  Lihat inisiatif
                </a>
              </dd>
            </div>
          )}
        </dl>
        <section aria-label="Progres penjangkauan" className="space-y-2">
          <h2>Progres penjangkauan</h2>
          <p>
            {loaderData.outreach.closed ? (
              loaderData.outreach.closedAt ? (
                <>
                  Kebutuhan ditutup pada <LocalTimestamp value={loaderData.outreach.closedAt} />
                </>
              ) : (
                "Kebutuhan ditutup"
              )
            ) : (
              "Kebutuhan terbuka"
            )}
          </p>
          <p>
            Respons — Total: {loaderData.outreach.total} · Menunggu: {loaderData.outreach.pending} ·
            Berminat: {loaderData.outreach.interested} · Ditolak: {loaderData.outreach.declined} ·
            Dibatalkan: {loaderData.outreach.cancelled} · Kedaluwarsa: {loaderData.outreach.expired}
          </p>
          <p>
            Hasil bantuan — {outcomeStateLabels.introduced}: {loaderData.outreach.introduced} ·{" "}
            {outcomeStateLabels["help-confirmed"]}: {loaderData.outreach.helpConfirmed} ·{" "}
            {outcomeStateLabels.completed}: {loaderData.outreach.completed} ·{" "}
            {outcomeStateLabels["did-not-proceed"]}: {loaderData.outreach.didNotProceed}
          </p>
          <p>Total perkenalan: {loaderData.outreach.introducedTotal}</p>
        </section>
        <section aria-label="Status persetujuan">
          <h2 className="text-xl font-semibold">Persetujuan versi {need.version}</h2>
          <p>Validasi staf: {need.staffValidated ? "Selesai" : "Belum"}</p>
          <p>Persetujuan koordinator direktori: {need.coordinatorApproved ? "Selesai" : "Belum"}</p>
        </section>
        {access.canValidate && (
          <Form method="post">
            <input type="hidden" name="intent" value="validate" />
            <input type="hidden" name="expectedVersion" value={need.version} />
            <button type="submit" disabled={busy}>
              Validasi sebagai perwakilan staf
            </button>
          </Form>
        )}
        {access.canApprove && (
          <Form method="post">
            <input type="hidden" name="intent" value="approve" />
            <input type="hidden" name="expectedVersion" value={need.version} />
            <button type="submit" disabled={busy}>
              Setujui penjangkauan sebagai koordinator direktori
            </button>
          </Form>
        )}
        {access.canEdit && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Ubah rincian kebutuhan</h2>
            <p>Perubahan membuat versi baru dan membatalkan kedua persetujuan sebelumnya.</p>
            <Form method="post" className="space-y-4" {...formProps}>
              <input type="hidden" name="intent" value="edit" />
              <input type="hidden" name="expectedVersion" value={need.version} />
              <SchoolNeedFormFields
                defaults={need}
                staffContacts={loaderData.staffContacts}
                errors={errors}
              />
              <button type="submit" disabled={busy}>
                Simpan versi baru
              </button>
            </Form>
          </section>
        )}
        <section aria-label="Riwayat persetujuan">
          <h2 className="text-xl font-semibold">Riwayat versi dan persetujuan</h2>
          {revisions.map((revision) => (
            <p key={revision.version}>
              Versi {revision.version} · <LocalTimestamp value={revision.createdAt} />
              {"actorUserId" in revision && revision.actorUserId
                ? ` · ${revision.actorUserId}`
                : ""}
            </p>
          ))}
          {approvals.map((approval) => (
            <p key={`${approval.version}-${approval.stage}`}>
              Versi {approval.version} ·{" "}
              {approval.stage === "staff-validation" ? "Validasi staf" : "Persetujuan koordinator"}{" "}
              · <LocalTimestamp value={approval.approvedAt} />
              {"actorUserId" in approval && approval.actorUserId
                ? ` · ${approval.actorUserId}`
                : ""}
            </p>
          ))}
        </section>
      </main>
    </>
  );
}
