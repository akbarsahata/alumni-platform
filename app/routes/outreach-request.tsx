import { env } from "cloudflare:workers";
import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/outreach-request";
import { readOutreachRequest, respondOutreach } from "../outreach/outreach.server";
import { NeedDetails } from "../outreach/need-details";
import { outreachStatusLabels } from "../outreach/model";
import { pageTitle } from "../content/page-title";
export function meta() {
  return [{ title: pageTitle("Tanggapi permintaan bantuan") }];
}
export async function loader({ request, params }: Route.LoaderArgs) {
  return readOutreachRequest(request, env, params.requestId);
}
export async function action({ request, params }: Route.ActionArgs) {
  const f = await request.formData();
  try {
    await respondOutreach(request, env, params.requestId, {
      outcome: f.get("outcome"),
      reason: f.get("outcome") === "declined" ? (f.get("reason") ?? "") : "",
    });
    return { error: null };
  } catch (e) {
    if (!(e instanceof Response) || ![400, 403, 404, 409].includes(e.status)) throw e;
    return data({ error: await e.text() }, { status: e.status });
  }
}
export default function OutreachRequest({ loaderData: d, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto max-w-3xl space-y-6 break-words">
      <Link to="/outreach">← Permintaan bantuan</Link>
      <h1>{d.need.title}</h1>
      <p role="status">{outreachStatusLabels[d.request.status]}</p>
      <NeedDetails need={d.need} />
      <p>Batas respons (UTC): {d.request.expiresAt}</p>
      <p>Menyatakan minat tidak membagikan email Anda.</p>
      <p>Penolakan dan alasannya hanya dilihat koordinator direktori.</p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {d.request.status === "pending" && (
        <Form method="post" className="space-y-4">
          <label className="block">
            Alasan penolakan (opsional)
            <textarea name="reason" maxLength={1000} rows={3} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button name="outcome" value="interested" disabled={busy}>
              Saya berminat
            </button>
            <button name="outcome" value="declined" disabled={busy}>
              Tolak permintaan
            </button>
          </div>
        </Form>
      )}
    </main>
  );
}
