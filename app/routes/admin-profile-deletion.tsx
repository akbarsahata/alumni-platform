import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/admin-profile-deletion";
import {
  completeProfileDeletion,
  readProfileDeletionRequest,
  removeClarificationContent,
  removeProfileContent,
} from "../deletion/profile-deletion.server";
import { pageTitle } from "../content/page-title";
import { LocalTimestamp } from "../components/local-timestamp";

export function meta() {
  return [{ title: pageTitle("Proses penghapusan profil") }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return readProfileDeletionRequest(request, env, params.requestId);
}

const actionLabels: Record<string, string> = {
  requested: "Permintaan diajukan",
  "profile-removed": "Konten profil dihapus",
  "clarification-removed": "Teks klarifikasi privat dihapus",
  completed: "Penghapusan diselesaikan",
};

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");
  try {
    if (intent === "profile-removal") {
      await removeProfileContent(request, env, params.requestId, {});
      return { error: null, message: "Konten profil dihapus." };
    }
    if (intent === "clarification-removal") {
      await removeClarificationContent(request, env, params.requestId, {});
      return { error: null, message: "Teks klarifikasi privat dihapus." };
    }
    if (intent === "complete") {
      await completeProfileDeletion(request, env, params.requestId, {
        note: form.get("note"),
      });
      return { error: null, message: "Penghapusan profil diselesaikan." };
    }
    return data({ error: "Tindakan tidak valid.", message: null }, { status: 400 });
  } catch (error) {
    if (!(error instanceof Response) || ![400, 404, 409].includes(error.status)) throw error;
    return data({ error: await error.text(), message: null }, { status: error.status });
  }
}

export default function AdminProfileDeletion({ loaderData, actionData }: Route.ComponentProps) {
  const { request } = loaderData;
  const busy = useNavigation().state !== "idle";
  const active = request.status === "active";
  const bothRemoved = request.steps.profileRemoved && request.steps.clarificationRemoved;
  return (
    <main className="mx-auto max-w-3xl space-y-6 break-words p-4">
      <Link to="/admin/profile-deletions">← Penghapusan profil</Link>
      <h1 className="text-2xl font-semibold">Proses penghapusan profil</h1>
      <p>
        Halaman ini tidak memberi akses pencarian direktori atau isi percakapan klarifikasi.
        Tindakan di bawah hanya menghapus konten profil dan teks klarifikasi privat yang tercakup
        permintaan ini.
      </p>

      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.message && <p role="status">{actionData.message}</p>}

      <section aria-label="Identitas aman" className="space-y-1 rounded border p-4">
        <h2 className="text-xl font-semibold">Ringkasan permintaan</h2>
        <p>ID akun: {request.memberUserId}</p>
        <p>Nama semasa sekolah: {request.schoolName || "Tidak tercatat"}</p>
        <p>House: {request.house ?? "Tidak tercatat"}</p>
        <p>
          Diajukan: <LocalTimestamp value={request.requestedAt} />
        </p>
        <p>
          Target selesai: <LocalTimestamp value={request.dueAt} />
        </p>
        <p role="status">
          {request.status === "completed" ? (
            <>
              Selesai pada <LocalTimestamp value={request.completedAt!} />.
            </>
          ) : request.overdue ? (
            "Permintaan telah melewati target 30 hari dan tetap perlu diproses."
          ) : (
            "Permintaan masih dalam target 30 hari."
          )}
        </p>
        {request.completedAt && (
          <p>
            Waktu penyelesaian: <LocalTimestamp value={request.completedAt} />
          </p>
        )}
        {request.completedLate && (
          <p>
            Penyelesaian tercatat setelah target 30 hari. Tanggal target tidak dihitung ulang dari
            waktu penyelesaian.
          </p>
        )}
        {request.completionNote && <p>Bukti penyelesaian: {request.completionNote}</p>}
      </section>

      <section aria-label="Langkah penghapusan" className="space-y-3 rounded border p-4">
        <h2 className="text-xl font-semibold">Langkah manual</h2>
        <div className="space-y-2 rounded border p-3">
          <h3 className="font-semibold">1. Hapus konten profil</h3>
          <p>
            Menghapus baris profil beserta perkenalan, lokasi, keahlian, ketersediaan, dan penanda
            penghapusan. Tidak menghapus akun, keanggotaan, permintaan, perkenalan, hasil bantuan,
            atau audit.
          </p>
          <p role="status">
            Status:{" "}
            {request.steps.profileRemoved ? (
              <>
                selesai pada <LocalTimestamp value={request.profileRemovedAt!} />,{" "}
                {request.profileRemovalCount ?? 0} baris
              </>
            ) : (
              "belum dihapus"
            )}
          </p>
          {active && (
            <Form method="post">
              <input type="hidden" name="intent" value="profile-removal" />
              <label className="flex items-start gap-2">
                <input type="checkbox" required />
                <span>Saya memahami tindakan ini menghapus konten profil secara permanen.</span>
              </label>
              <button disabled={busy}>Hapus konten profil</button>
            </Form>
          )}
        </div>

        <div className="space-y-2 rounded border p-3">
          <h3 className="font-semibold">2. Hapus teks klarifikasi privat</h3>
          <p>
            Menghapus semua pesan pada permintaan bantuan tempat anggota ini menjadi penerima. Pesan
            yang ditulis anggota sebagai koordinator pada percakapan anggota lain tidak dihapus.
          </p>
          <p role="status">
            Status:{" "}
            {request.steps.clarificationRemoved ? (
              <>
                selesai pada <LocalTimestamp value={request.clarificationRemovedAt!} />,{" "}
                {request.clarificationRemovalCount ?? 0} pesan
              </>
            ) : (
              "belum dihapus"
            )}
          </p>
          {active && (
            <Form method="post">
              <input type="hidden" name="intent" value="clarification-removal" />
              <label className="flex items-start gap-2">
                <input type="checkbox" required />
                <span>Saya memahami tindakan ini menghapus teks klarifikasi secara permanen.</span>
              </label>
              <button disabled={busy}>Hapus teks klarifikasi privat</button>
            </Form>
          )}
        </div>

        <div className="space-y-2 rounded border p-3">
          <h3 className="font-semibold">3. Selesaikan penghapusan</h3>
          <p>
            Penyelesaian hanya dapat dilakukan setelah kedua langkah di atas selesai. Bukti
            penyelesaian wajib diisi 1-1.000 karakter dan tidak boleh memuat isi profil atau pesan
            klarifikasi.
          </p>
          {active && (
            <Form method="post" className="space-y-2">
              <input type="hidden" name="intent" value="complete" />
              <label className="block">
                Bukti penyelesaian
                <textarea name="note" rows={3} maxLength={1000} minLength={1} required />
              </label>
              <button disabled={busy || !bothRemoved}>Selesaikan penghapusan</button>
              {!bothRemoved && <p>Kedua langkah penghapusan harus selesai terlebih dahulu.</p>}
            </Form>
          )}
        </div>
      </section>

      <section aria-label="Riwayat tindakan" className="space-y-2 rounded border p-4">
        <h2 className="text-xl font-semibold">Riwayat tindakan</h2>
        <ol className="space-y-2">
          {(request.events ?? []).map((event) => (
            <li key={event.id} className="rounded border p-3">
              <p className="font-semibold">{actionLabels[event.action] ?? event.action}</p>
              <p>Pelaku (ID akun): {event.actorUserId}</p>
              <p>
                Waktu: <LocalTimestamp value={event.occurredAt} />
              </p>
              {event.count !== null && <p>Jumlah baris: {event.count}</p>}
              {event.note && <p>Bukti: {event.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
