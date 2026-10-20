import {
  outcomeActorKindLabels,
  outcomeEventKindLabels,
  outcomeStateLabels,
  type OutcomeActorKind,
  type OutcomeEventKind,
  type OutcomeState,
} from "./model";

export type OutcomeEventView = {
  id: string;
  revision: number;
  kind: OutcomeEventKind;
  actorUserId: string;
  actorKind: OutcomeActorKind;
  previousState: OutcomeState;
  state: OutcomeState;
  note: string | null;
  occurredAt: string;
};

export type OutcomeView = {
  revision: number;
  state: OutcomeState;
  introducedAt: string;
  updatedAt: string;
  events: OutcomeEventView[];
  latest: OutcomeEventView | null;
};

export function OutcomeSummary({ outcome }: { outcome: OutcomeView }) {
  const latestNote = [...outcome.events].reverse().find((event) => event.note)?.note ?? null;
  const source = outcome.latest
    ? `${outcomeEventKindLabels[outcome.latest.kind]} (${outcomeActorKindLabels[outcome.latest.actorKind]})`
    : "Perkenalan terkirim";
  const sourceAt = outcome.latest?.occurredAt ?? outcome.introducedAt;
  return (
    <div className="space-y-2 rounded border p-3">
      <p>
        <strong>Status saat ini:</strong> {outcomeStateLabels[outcome.state]}
      </p>
      <p>
        <strong>Sumber:</strong> {source} · <time dateTime={sourceAt}>{sourceAt}</time>
      </p>
      <p>
        <strong>Diperkenalkan:</strong>{" "}
        <time dateTime={outcome.introducedAt}>{outcome.introducedAt}</time>
      </p>
      <p>
        <strong>Catatan terbaru:</strong> {latestNote ?? "Belum ada catatan hasil bantuan."}
      </p>
      {!!outcome.events.length && (
        <details>
          <summary>Riwayat hasil bantuan ({outcome.events.length})</summary>
          <ol className="mt-2 space-y-2">
            {outcome.events.map((event) => (
              <li className="rounded border p-2" key={event.id}>
                <p>
                  Revisi {event.revision} · {outcomeEventKindLabels[event.kind]} (
                  {outcomeActorKindLabels[event.actorKind]})
                </p>
                <p>
                  {outcomeStateLabels[event.previousState]} → {outcomeStateLabels[event.state]}
                </p>
                <p>
                  Pelaku (ID): <span className="break-all">{event.actorUserId}</span>
                </p>
                <p>
                  Waktu (UTC): <time dateTime={event.occurredAt}>{event.occurredAt}</time>
                </p>
                {event.note && <p>Catatan: {event.note}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

export function OutcomeStateSelect({
  defaultValue,
  id,
}: {
  defaultValue?: OutcomeState;
  id?: string;
}) {
  return (
    <select id={id} name="state" required defaultValue={defaultValue ?? ""}>
      <option value="" disabled>
        Pilih hasil bantuan
      </option>
      {Object.entries(outcomeStateLabels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
