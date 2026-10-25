import { pageTitle } from "../content/page-title";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/admin-roles";
import { requirePrimary } from "../authorization/permissions.server";
import {
  changeRole,
  listAccounts,
  setRepresentativeName,
} from "../authorization/administration.server";
import { roles, roleLabels, type Role } from "../authorization/roles";

export function meta() {
  return [{ title: pageTitle("Kelola peran") }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requirePrimary(request, env);
  return { accounts: await listAccounts(env) };
}

export async function action({ request }: Route.ActionArgs) {
  // Authorize before parsing or rendering any submitted account details.
  await requirePrimary(request, env);
  const form = await request.formData();
  try {
    if (form.get("intent") === "representative-name") {
      const { intent: _intent, ...input } = Object.fromEntries(form);
      const result = await setRepresentativeName(request, env, input);
      return {
        message: result.changed
          ? "Nama perwakilan berhasil diperbarui."
          : "Nama perwakilan tidak berubah.",
        error: null,
      };
    }
    const result = await changeRole(request, env, Object.fromEntries(form));
    return {
      message: result.changed
        ? "Peran berhasil diperbarui."
        : "Peran sudah sesuai. Tidak ada perubahan.",
      error: null,
    };
  } catch (error) {
    if (!(error instanceof Response) || ![400, 409].includes(error.status)) throw error;
    return data({ message: null, error: await error.text() }, { status: error.status });
  }
}

export default function AdminRoles({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const representatives = loaderData.accounts.filter(
    (account) => account.roles.includes("staff") || account.roles.includes("student")
  );
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Kelola peran</h1>
      <p>
        Hanya administrator utama dapat memberikan dan mencabut peran. Peran terpisah dari
        keanggotaan alumni.
      </p>
      <nav className="flex gap-4">
        <Link className="underline" to="/admin/audit">
          Riwayat perubahan
        </Link>
        <Link className="underline" to="/admin/invitations">
          Undang perwakilan sekolah
        </Link>
      </nav>
      {actionData?.message && <p role="status">{actionData.message}</p>}
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      <Form method="post" className="space-y-4">
        <div>
          <label htmlFor="target-account">Akun terverifikasi</label>
          <select
            id="target-account"
            name="targetUserId"
            required
            className="block border rounded p-2 w-full"
            defaultValue=""
          >
            <option value="" disabled>
              Pilih akun
            </option>
            {loaderData.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="assigned-role">Peran</label>
          <select id="assigned-role" name="role" className="block border rounded p-2 w-full">
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </div>
        <label className="block">
          Alasan
          <Textarea
            name="reason"
            required
            maxLength={1000}
            className="block border rounded p-2 w-full"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <Button type="submit" name="action" value="grant" disabled={busy}>
            Berikan peran
          </Button>
          <Button type="submit" name="action" value="revoke" variant="destructive" disabled={busy}>
            Cabut peran
          </Button>
        </div>
      </Form>
      <section aria-label="Nama perwakilan sekolah" className="space-y-3">
        <h2 className="text-xl font-semibold">Nama perwakilan sekolah</h2>
        <p>
          Tetapkan atau koreksi nama yang terlihat pada pemilih staf, kebutuhan sekolah, dan
          perkenalan alumni. Nama hanya mengubah identitas tampilan akun yang sama; email, peran,
          keanggotaan, dan profil tidak berubah.
        </p>
        {representatives.length ? (
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="representative-name" />
            <label className="block">
              Akun perwakilan
              <select name="targetUserId" required defaultValue="">
                <option value="" disabled>
                  Pilih akun
                </option>
                {representatives.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email} · {account.name.trim() || "Belum diisi"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Nama perwakilan
              <Input name="representativeName" required maxLength={200} />
            </label>
            <Button type="submit" disabled={busy}>
              Simpan nama
            </Button>
          </Form>
        ) : (
          <p>Belum ada akun perwakilan staf atau siswa terverifikasi.</p>
        )}
      </section>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <caption className="text-left font-semibold">Peran saat ini</caption>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nama perwakilan</th>
              <th>Peran</th>
            </tr>
          </thead>
          <tbody>
            {loaderData.accounts.map((account) => (
              <tr key={account.id}>
                <td className="p-2">{account.email}</td>
                <td className="p-2">{account.name.trim() || "Belum diisi"}</td>
                <td className="p-2">
                  {account.roles.map((role) => roleLabels[role as Role]).join(", ") ||
                    "Tanpa peran tambahan"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
