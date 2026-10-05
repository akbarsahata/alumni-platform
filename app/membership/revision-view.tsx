import type { Revision } from "./model";

export function RevisionView({ revision }: { revision: Revision }) {
  return (
    <dl className="space-y-2">
      <div>
        <dt>Nama semasa sekolah</dt>
        <dd>{revision.schoolName}</dd>
      </div>
      <div>
        <dt>House</dt>
        <dd>{revision.house}</dd>
      </div>
      <div>
        <dt>
          {revision.studentType === "graduate"
            ? "Tahun kelulusan"
            : "Masa bersekolah (tidak lulus)"}
        </dt>
        <dd>
          {revision.studentType === "graduate"
            ? revision.graduationYear
            : `${revision.attendanceStart}–${revision.attendanceEnd}`}
        </dd>
      </div>
      <div>
        <dt>Penjelasan untuk tinjauan manual</dt>
        <dd className="whitespace-pre-wrap">{revision.explanation}</dd>
      </div>
      <div>
        <dt>Diajukan (UTC)</dt>
        <dd>{revision.submittedAt}</dd>
      </div>
    </dl>
  );
}
