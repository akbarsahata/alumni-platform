import { env } from "cloudflare:workers";
import { Form, Link, data, isRouteErrorResponse, useNavigation } from "react-router";
import { pageTitle } from "../content/page-title";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { readReference, respondReference } from "../membership/references.server";
import type { Route } from "./+types/reference-response";

export function meta() {
  return [{ title: pageTitle("Respons referensi") }];
}
export async function loader({ request, params }: Route.LoaderArgs) {
  return readReference(request, env, params.requestId);
}
export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  try {
    await respondReference(request, env, params.requestId, Object.fromEntries(form));
    return {
      error: null,
      message: "Respons tersimpan. Administrator tetap menentukan keputusan keanggotaan.",
    };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 409].includes(error.status)) throw error;
    return data({ error: await error.text(), message: null }, { status: error.status });
  }
}
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error) ? error.data : "Permintaan tidak tersedia.";
  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <h1>Respons referensi</h1>
      <p role="alert">{message}</p>
      <Link to="/login" className="underline">
        Masuk dengan email penerima
      </Link>
      <p>Setelah masuk, buka kembali tautan permintaan dari email Anda.</p>
    </main>
  );
}
export default function ReferenceResponse({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Respons referensi alumni</h1>
      <Link to="/" className="underline">
        Beranda
      </Link>
      <p>Nama semasa sekolah: {loaderData.schoolName}</p>
      <p>Tahun kelulusan: {loaderData.graduationYear}</p>
      <p>House: {loaderData.house}</p>
      <p>Berlaku sampai (UTC): {loaderData.expiresAt}</p>
      <p>
        Referensi harus kenal pribadi dengan pemohon semasa sekolah. Tahun kelulusan boleh berbeda.
      </p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.message && <p role="status">{actionData.message}</p>}
      {loaderData.answered ? (
        <p>Permintaan sudah dijawab. Respons tidak dapat diubah.</p>
      ) : (
        <Form method="post" className="space-y-4">
          <div>
            <label htmlFor="reference-outcome">Respons</label>
            <select
              id="reference-outcome"
              name="outcome"
              required
              className="block border rounded p-2 w-full"
              defaultValue=""
            >
              <option value="" disabled>
                Pilih respons
              </option>
              <option value="endorse">Dukung</option>
              <option value="decline">Tolak dukungan</option>
              <option value="cannot-confirm">Tidak dapat memastikan</option>
            </select>
          </div>
          <label className="block">
            <Input type="checkbox" name="personallyKnown" className="w-4 h-4 inline-block" /> Saya
            kenal pribadi dengan pemohon semasa sekolah
          </label>
          <label className="block">
            Komentar privat untuk pemeriksa
            <Textarea name="comment" maxLength={1000} className="block border rounded p-2 w-full" />
          </label>
          <p>
            Detail respons dan komentar hanya tersedia untuk pemeriksa. Dukungan tidak langsung
            menyetujui keanggotaan.
          </p>
          <Button type="submit" disabled={busy}>
            Kirim respons
          </Button>
        </Form>
      )}
    </main>
  );
}
