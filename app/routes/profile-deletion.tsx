import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/profile-deletion";
import { readProfileDeletion, requestProfileDeletion } from "../deletion/profile-deletion.server";
import { pageTitle } from "../content/page-title";
import { LocalTimestamp } from "../components/local-timestamp";

export function meta() {
  return [{ title: pageTitle("Privasi & penghapusan") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return readProfileDeletion(request, env);
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  try {
    await requestProfileDeletion(request, env, {
      confirm: form.get("confirm") === "true",
    });
    return {
      error: null,
      message: "Permintaan penghapusan profil tercatat. Profil Anda langsung disembunyikan.",
    };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 409].includes(error.status)) throw error;
    return data({ error: await error.text(), message: null }, { status: error.status });
  }
}

export default function ProfileDeletion({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const request = loaderData.request;
  return (
    <main className="mx-auto max-w-3xl space-y-6 break-words p-4">
      <Link to="/profile">← Profil &amp; Keahlian</Link>
      <h1 className="text-2xl font-semibold">Privasi &amp; penghapusan</h1>
      <p>
        Permintaan ini hanya menghapus profil direktori. Akun, keanggotaan, peran, dan catatan
        keuangan memiliki kebijakan terpisah dan tidak ikut dihapus.
      </p>
      <section
        aria-label="Yang terjadi setelah permintaan"
        className="space-y-2 rounded border p-4"
      >
        <h2 className="text-xl font-semibold">Yang terjadi setelah Anda mengajukan</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Profil langsung hilang dari pencarian direktori dan daftar penerima penjangkauan.</li>
          <li>
            Permintaan bantuan yang belum dijawab, pengingat, dan perkenalan yang belum dikirim
            dibatalkan.
          </li>
          <li>
            Minat atau penolakan yang sudah tercatat, perkenalan yang sudah dibagikan, dan hasil
            bantuan tetap tersimpan sebagai riwayat terbatas.
          </li>
          <li>Email yang sudah dibagikan kepada kontak staf tidak dapat ditarik kembali.</li>
          <li>
            Teks klarifikasi privat Anda dihapus selama pemrosesan. Pesan yang Anda tulis sebagai
            koordinator pada percakapan anggota lain tidak dihapus.
          </li>
          <li>
            Organisasi menargetkan penyelesaian konten profil dan teks klarifikasi privat dalam 30
            hari.
          </li>
        </ul>
        <p>
          Permintaan tidak dapat dibatalkan. Setelah selesai, Anda dapat membuat profil baru bila
          ingin ikut lagi. Batas waktu ini bukan penghapusan otomatis; operator utama memproses
          setiap langkah secara manual.
        </p>
      </section>

      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.message && (
        <p role="status" className="rounded border border-green-300 p-3">
          {actionData.message}
        </p>
      )}

      {request && (
        <section
          aria-label="Status permintaan penghapusan"
          className="space-y-2 rounded border p-4"
        >
          <h2 className="text-xl font-semibold">Status permintaan</h2>
          <p role="status">
            {request.status === "completed"
              ? "Penghapusan selesai."
              : request.overdue
                ? "Permintaan sedang diproses dan telah melewati target 30 hari."
                : "Permintaan sedang diproses."}
          </p>
          <p>
            Diajukan: <LocalTimestamp value={request.requestedAt} />
          </p>
          <p>
            Target selesai: <LocalTimestamp value={request.dueAt} />
          </p>
          {request.completedAt && (
            <p>
              Selesai: <LocalTimestamp value={request.completedAt} />
            </p>
          )}
          {request.completedLate && (
            <p>
              Penyelesaian tercatat setelah target 30 hari; riwayat tetap menyimpan waktu target.
            </p>
          )}
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Hapus konten profil:{" "}
              {request.steps.profileRemoved
                ? `selesai (${request.profileRemovalCount ?? 0} baris)`
                : "belum"}
            </li>
            <li>
              Hapus teks klarifikasi privat:{" "}
              {request.steps.clarificationRemoved
                ? `selesai (${request.clarificationRemovalCount ?? 0} pesan)`
                : "belum"}
            </li>
          </ul>
          {request.status === "active" && (
            <p>
              Permintaan ini tidak dapat dibatalkan dari halaman ini. Hubungi operator utama bila
              ada kekeliruan.
            </p>
          )}
        </section>
      )}

      {request?.status === "active" ? null : loaderData.profileExists ? (
        <Form method="post" className="space-y-3 rounded border p-4">
          <h2 className="text-xl font-semibold">Ajukan penghapusan profil</h2>
          {request && (
            <p>
              Profil yang Anda buat setelah penyelesaian sebelumnya dapat dihapus melalui permintaan
              baru. Riwayat penyelesaian di atas tetap tersimpan.
            </p>
          )}
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirm" value="true" required />
            <span>
              Saya memahami bahwa profil langsung disembunyikan, penjangkauan yang belum dijawab
              dibatalkan, akun dan keanggotaan tidak dihapus, dan email yang sudah dibagikan tidak
              dapat ditarik kembali.
            </span>
          </label>
          <button disabled={busy}>{busy ? "Memproses…" : "Ajukan penghapusan profil"}</button>
        </Form>
      ) : (
        <p>
          {request ? "Profil tidak lagi tersedia. " : "Belum ada profil direktori untuk dihapus. "}
          <Link className="underline" to="/profile">
            {request ? "Buka profil untuk membuat profil baru" : "Kembali ke profil"}
          </Link>
          .
        </p>
      )}
    </main>
  );
}
