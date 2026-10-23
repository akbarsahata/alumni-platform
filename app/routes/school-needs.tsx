import { env } from "cloudflare:workers";
import { useEffect } from "react";
import { Form, Link, data, useNavigation, useSearchParams } from "react-router";
import { Toaster, toast } from "sonner";
import type { Route } from "./+types/school-needs";
import { pageTitle } from "../content/page-title";
import { needStatusLabels } from "../school-needs/model";
import { SchoolNeedFormFields } from "../school-needs/form-fields";
import { useSchoolNeedFormValidation } from "../school-needs/use-form-validation";
import { schoolNeedFormInput } from "../school-needs/form-input";
import { readSchoolNeeds, submitSchoolNeed } from "../school-needs/school-needs.server";

export function meta() {
  return [{ title: pageTitle("Kebutuhan sekolah") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return await readSchoolNeeds(request, env);
}

export async function action({ request }: Route.ActionArgs) {
  try {
    await submitSchoolNeed(request, env, schoolNeedFormInput(await request.formData()));
    return { error: null, message: "Kebutuhan sekolah berhasil dikirim untuk ditinjau." };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 403, 409].includes(error.status)) throw error;
    return data({ error: await error.text(), message: null }, { status: error.status });
  }
}

function NeedList({
  title,
  needs,
  nextCursor,
  cursorParam,
}: {
  title: string;
  needs: Awaited<ReturnType<typeof readSchoolNeeds>>["ownNeeds"];
  nextCursor: string | null;
  cursorParam: string;
}) {
  const [searchParams] = useSearchParams();
  const nextPage = new URLSearchParams(searchParams);
  if (nextCursor) nextPage.set(cursorParam, nextCursor);
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {needs.length ? (
        <ul className="space-y-2">
          {needs.map((need) => (
            <li key={need.id}>
              <Link to={`/school-needs/${need.id}`}>
                {need.title} · {needStatusLabels[need.status]} · versi {need.version}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Belum ada kebutuhan untuk ditinjau.</p>
      )}
      {nextCursor && (
        <Link className="underline" to={`?${nextPage}`}>
          Halaman berikutnya
        </Link>
      )}
    </section>
  );
}

export default function SchoolNeeds({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const hasContacts = loaderData.staffContacts.length > 0;
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
      <main className="mx-auto max-w-3xl space-y-8">
        <h1 className="text-2xl font-semibold">Kebutuhan sekolah</h1>
        <p>
          Ajukan kegiatan sekolah atau pendampingan siswa. Kebutuhan harus divalidasi oleh staf yang
          disebutkan dan disetujui koordinator direktori sebelum penjangkauan. Profil alumni tidak
          diperlukan untuk mengajukan kebutuhan.
        </p>
        {actionData?.error && <p role="alert">{actionData.error}</p>}
        {actionData?.message && <p role="status">{actionData.message}</p>}
        <section aria-label="Ajukan kebutuhan sekolah" className="space-y-4">
          <h2 className="text-xl font-semibold">Ajukan kebutuhan</h2>
          {!hasContacts && (
            <p role="status">Belum ada perwakilan staf sekolah terverifikasi yang dapat dipilih.</p>
          )}
          <Form method="post" className="space-y-4" {...formProps}>
            <SchoolNeedFormFields staffContacts={loaderData.staffContacts} errors={errors} />
            <button type="submit" disabled={busy || !hasContacts}>
              {busy ? "Mengirim…" : "Kirim kebutuhan"}
            </button>
          </Form>
        </section>
        <NeedList
          title="Kebutuhan yang saya ajukan"
          needs={loaderData.ownNeeds}
          nextCursor={loaderData.ownNeedsNextCursor}
          cursorParam="ownAfter"
        />
        {loaderData.staffQueue.length > 0 && (
          <NeedList
            title="Menunggu validasi staf Anda"
            needs={loaderData.staffQueue}
            nextCursor={loaderData.staffQueueNextCursor}
            cursorParam="staffAfter"
          />
        )}
        {loaderData.coordinatorQueue.length > 0 && (
          <NeedList
            title="Menunggu persetujuan koordinator direktori"
            needs={loaderData.coordinatorQueue}
            nextCursor={loaderData.coordinatorQueueNextCursor}
            cursorParam="coordinatorAfter"
          />
        )}
      </main>
    </>
  );
}
