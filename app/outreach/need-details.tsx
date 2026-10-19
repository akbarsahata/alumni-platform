type NeedDetailsProps = {
  need: {
    purpose: string;
    requestedHelp: string;
    timeCommitment: string;
    timing: string | null;
    deadline: string | null;
    locationMode: string;
    locationDetails: string;
    participationTerms: string;
    paidDetails: string;
    staffContactName: string;
  };
};
export function NeedDetails({ need }: NeedDetailsProps) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {[
        ["Tujuan sekolah", need.purpose],
        ["Keahlian atau bantuan", need.requestedHelp],
        ["Komitmen waktu", need.timeCommitment],
        ["Waktu dan batas waktu", [need.timing, need.deadline].filter(Boolean).join(" · ")],
        [
          "Lokasi",
          [
            need.locationMode === "remote" ? "Jarak jauh" : "Di lokasi sekolah",
            need.locationDetails,
          ]
            .filter(Boolean)
            .join(" · "),
        ],
        [
          "Ketentuan partisipasi",
          [need.participationTerms === "voluntary" ? "Sukarela" : "Berbayar", need.paidDetails]
            .filter(Boolean)
            .join(" · "),
        ],
        ["Kontak staf terverifikasi", need.staffContactName],
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="font-semibold">{label}</dt>
          <dd className="whitespace-pre-wrap break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
