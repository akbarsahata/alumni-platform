import { Form, useNavigation } from "react-router";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { WelcomeIntro } from "./welcome-intro";

export function LoginPage({
  loaderData,
  actionData,
}: {
  loaderData: { emailChanged: boolean };
  actionData?: { email: string; sent: boolean; error: string | null };
}) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  return (
    <main className="guest-login-page">
      <WelcomeIntro />
      <section className="login-page space-y-6" aria-labelledby="login-heading">
        <p className="eyebrow">SELAMAT DATANG KEMBALI</p>
        <h2 id="login-heading" className="text-2xl font-semibold">
          Masuk ke keluarga alumni
        </h2>
        {loaderData.emailChanged && (
          <p role="status">Email login berubah. Masuk kembali menggunakan email baru.</p>
        )}
        <p>Gunakan email Anda. Kami akan mengirim kode untuk masuk.</p>
        {actionData?.error && <p role="alert">{actionData.error}</p>}
        {actionData?.sent && (
          <p role="status">Kode telah dikirim. Periksa email Anda. Kode berlaku selama 5 menit.</p>
        )}
        <Form method="post" className="space-y-4">
          <label className="block">
            Email
            <Input
              className="block border rounded p-2 w-full"
              type="email"
              name="email"
              autoComplete="email"
              defaultValue={actionData?.email}
              required
            />
          </label>
          <Button
            type="submit"
            disabled={busy}
            name="intent"
            value="send"
            className="border rounded px-4 py-2"
          >
            {actionData?.sent ? "Kirim ulang kode" : "Kirim kode"}
          </Button>
        </Form>
        {actionData?.sent && (
          <Form method="post" className="space-y-4">
            <Input type="hidden" name="email" value={actionData.email} />
            <label className="block">
              Kode masuk
              <Input
                className="block border rounded p-2 w-full"
                type="text"
                name="otp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                required
              />
            </label>
            <Button
              type="submit"
              disabled={busy}
              name="intent"
              value="verify"
              className="border rounded px-4 py-2"
            >
              Masuk
            </Button>
          </Form>
        )}
        <p className="quiet-copy login-note">
          Email menghubungkan Anda dengan keluarga alumni. Keanggotaan alumni ditinjau secara
          terpisah.
        </p>
      </section>
    </main>
  );
}
