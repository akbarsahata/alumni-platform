import { pageTitle } from "../content/page-title";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/admin-roles";
import { requirePrimary } from "../authorization/permissions.server";
import { changeRole, listAccounts } from "../authorization/administration.server";
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
    const result = await changeRole(request, env, Object.fromEntries(form));
    return {
      message: result.changed
        ? "Peran berhasil diperbarui."
        : "Peran sudah sesuai. Tidak ada perubahan.",
      error: null,
    };
  } catch (error) {
    if (!(error instanceof Response) || error.status !== 400) throw error;
    return data({ message: null, error: await error.text() }, { status: 400 });
  }
}

export default function AdminRoles({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Kelola peran</h1>
      <p>
        Hanya administrator utama dapat memberikan dan mencabut peran. Peran terpisah dari
        keanggotaan alumni.
      </p>
      <nav className="flex gap-4">
        <Link className="underline" to="/">
          Beranda
        </Link>
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
          <Button
            type="submit"
            name="action"
            value="grant"
            disabled={busy}
            className="border rounded px-4 py-2"
          >
            Berikan peran
          </Button>
          <Button
            type="submit"
            name="action"
            value="revoke"
            disabled={busy}
            className="border rounded px-4 py-2"
          >
            Cabut peran
          </Button>
        </div>
      </Form>
      <table className="w-full text-left">
        <caption className="text-left font-semibold">Peran saat ini</caption>
        <thead>
          <tr>
            <th>Email</th>
            <th>Peran</th>
          </tr>
        </thead>
        <tbody>
          {loaderData.accounts.map((account) => (
            <tr key={account.id}>
              <td className="p-2">{account.email}</td>
              <td className="p-2">
                {account.roles.map((role) => roleLabels[role as Role]).join(", ") ||
                  "Tanpa peran tambahan"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
