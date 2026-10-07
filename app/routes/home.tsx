import { pageTitle } from "../content/page-title";
import { env } from "cloudflare:workers";
import { getAccount } from "../auth/auth.server";
import { LoginPage } from "../components/login-page";
import type { Route } from "./+types/home";
export { action } from "./login";
export function meta() {
  return [{ title: pageTitle() }];
}
export async function loader({ request }: Route.LoaderArgs) {
  const account = await getAccount(request, env);
  return {
    signedIn: !!account,
    emailChanged: new URL(request.url).searchParams.get("emailChanged") === "1",
  };
}
export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  if (!loaderData.signedIn) return <LoginPage loaderData={loaderData} actionData={actionData} />;
  return (
    <main className="mx-auto max-w-xl space-y-6">
      <p className="eyebrow">KELUARGA ALUMNI</p>
      <h1>Selamat datang kembali.</h1>
      <p>Pilih menu di atas untuk melanjutkan aktivitas Anda.</p>
    </main>
  );
}
