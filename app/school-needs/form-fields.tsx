import type { ReactNode } from "react";
import {
  needCategories,
  needCategoryLabels,
  participationTerms,
  type LocationMode,
  type NeedCategory,
  type ParticipationTerm,
} from "./model";
import {
  errorAttributes,
  FieldError,
  InitiativeLinkField,
  LocationFields,
  TimeCommitmentFields,
  TimingFields,
} from "./fields";
import type { SchoolNeedFieldErrors, SchoolNeedFieldName } from "./validation";

export type SchoolNeedDefaults = {
  category?: NeedCategory | "";
  title?: string;
  purpose?: string;
  requestedHelp?: string;
  timeCommitment?: string | null;
  timing?: string | null;
  deadline?: string | null;
  locationMode?: LocationMode | "";
  locationDetails?: string;
  staffContactUserId?: string;
  participationTerms?: ParticipationTerm | "";
  paidDetails?: string;
  initiativeLink?: string | null;
};

function Field({
  name,
  label,
  error,
  children,
}: {
  name: SchoolNeedFieldName;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block">
        {label}
        {children}
      </label>
      <FieldError name={name} message={error} />
    </div>
  );
}

export function SchoolNeedFormFields({
  defaults = {},
  staffContacts,
  errors,
}: {
  defaults?: SchoolNeedDefaults;
  staffContacts: { id: string; name: string }[];
  errors: SchoolNeedFieldErrors;
}) {
  return (
    <>
      <Field name="category" label="Jenis kebutuhan" error={errors.category}>
        <select
          name="category"
          required
          defaultValue={defaults.category ?? ""}
          {...errorAttributes("category", errors)}
        >
          <option value="" disabled>
            Pilih jenis kebutuhan
          </option>
          {needCategories.map((category) => (
            <option key={category} value={category}>
              {needCategoryLabels[category]}
            </option>
          ))}
        </select>
      </Field>
      <Field name="title" label="Judul" error={errors.title}>
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={defaults.title ?? ""}
          {...errorAttributes("title", errors)}
        />
      </Field>
      <Field name="purpose" label="Tujuan sekolah" error={errors.purpose}>
        <textarea
          name="purpose"
          required
          maxLength={2000}
          rows={4}
          defaultValue={defaults.purpose ?? ""}
          {...errorAttributes("purpose", errors)}
        />
      </Field>
      <Field
        name="requestedHelp"
        label="Keahlian atau bantuan yang dibutuhkan"
        error={errors.requestedHelp}
      >
        <textarea
          name="requestedHelp"
          required
          maxLength={2000}
          rows={4}
          defaultValue={defaults.requestedHelp ?? ""}
          {...errorAttributes("requestedHelp", errors)}
        />
      </Field>
      <TimeCommitmentFields value={defaults.timeCommitment} errors={errors} />
      <TimingFields value={defaults.timing} deadline={defaults.deadline} errors={errors} />
      <LocationFields
        defaultMode={defaults.locationMode}
        defaultDetails={defaults.locationDetails}
        errors={errors}
      />
      <div>
        <label className="block">
          Perwakilan staf terverifikasi
          <select
            name="staffContactUserId"
            required
            defaultValue={defaults.staffContactUserId ?? ""}
            {...errorAttributes("staffContactUserId", errors)}
          >
            <option value="" disabled>
              Pilih kontak staf
            </option>
            {staffContacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name || `Akun staf ${contact.id.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </label>
        <FieldError name="staffContactUserId" message={errors.staffContactUserId} />
        <p className="text-sm text-muted-foreground">
          Nama kontak diambil dari akun staf terverifikasi yang dipilih.
        </p>
      </div>
      <Field
        name="participationTerms"
        label="Ketentuan partisipasi"
        error={errors.participationTerms}
      >
        <select
          name="participationTerms"
          required
          defaultValue={defaults.participationTerms ?? ""}
          {...errorAttributes("participationTerms", errors)}
        >
          <option value="" disabled>
            Pilih ketentuan
          </option>
          {participationTerms.map((terms) => (
            <option key={terms} value={terms}>
              {terms === "voluntary" ? "Sukarela" : "Berbayar"}
            </option>
          ))}
        </select>
      </Field>
      <Field
        name="paidDetails"
        label="Rincian kompensasi (wajib jika berbayar)"
        error={errors.paidDetails}
      >
        <textarea
          name="paidDetails"
          maxLength={1000}
          rows={3}
          defaultValue={defaults.paidDetails ?? ""}
          {...errorAttributes("paidDetails", errors)}
        />
      </Field>
      <InitiativeLinkField defaultValue={defaults.initiativeLink} error={errors.initiativeLink} />
    </>
  );
}
