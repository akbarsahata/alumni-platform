import { useId, useRef, useState } from "react";
import {
  normalizeInitiativeLink,
  parseTimeCommitment,
  parseTiming,
  timeCommitmentFrequencyLabels,
  timeCommitmentFrequencies,
  timeCommitmentUnitLabels,
  timeCommitmentUnits,
} from "./payload";
import { locationModeLabels, locationModes, schoolLocation, type LocationMode } from "./model";
import type { SchoolNeedFieldErrors, SchoolNeedFieldName } from "./validation";

export function errorAttributes(name: SchoolNeedFieldName, errors: SchoolNeedFieldErrors) {
  const message = errors[name];
  return {
    "aria-invalid": message ? true : undefined,
    "aria-describedby": message ? `${name}-error` : undefined,
  } as const;
}

export function FieldError({ name, message }: { name: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={`${name}-error`} className="field-error" aria-live="polite">
      {message}
    </span>
  );
}

export function TimeCommitmentFields({
  value,
  errors = {},
}: {
  value?: string | null;
  errors?: SchoolNeedFieldErrors;
}) {
  const parsed = parseTimeCommitment(value);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Perkiraan komitmen waktu</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label>
            Jumlah
            <input
              name="timeCommitmentAmount"
              type="number"
              min={1}
              max={9999}
              step={1}
              required
              defaultValue={parsed?.amount ?? ""}
              {...errorAttributes("timeCommitmentAmount", errors)}
            />
          </label>
          <FieldError name="timeCommitmentAmount" message={errors.timeCommitmentAmount} />
        </div>
        <div>
          <label>
            Satuan
            <select
              name="timeCommitmentUnit"
              required
              defaultValue={parsed?.unit ?? ""}
              {...errorAttributes("timeCommitmentUnit", errors)}
            >
              <option value="" disabled>
                Pilih satuan
              </option>
              {timeCommitmentUnits.map((unit) => (
                <option key={unit} value={unit}>
                  {timeCommitmentUnitLabels[unit]}
                </option>
              ))}
            </select>
          </label>
          <FieldError name="timeCommitmentUnit" message={errors.timeCommitmentUnit} />
        </div>
        <div>
          <label>
            Frekuensi (opsional)
            <select
              name="timeCommitmentFrequency"
              defaultValue={parsed?.frequency ?? ""}
              {...errorAttributes("timeCommitmentFrequency", errors)}
            >
              <option value="">Tidak ditentukan</option>
              {timeCommitmentFrequencies.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {timeCommitmentFrequencyLabels[frequency]}
                </option>
              ))}
            </select>
          </label>
          <FieldError name="timeCommitmentFrequency" message={errors.timeCommitmentFrequency} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Contoh: 2 jam per minggu. Pilih frekuensi hanya jika komitmen berulang.
      </p>
      {value && !parsed && (
        <p className="text-sm">
          Nilai sebelumnya: {value}. Pilih ulang jumlah, satuan, dan frekuensi untuk menyimpan
          perubahan.
        </p>
      )}
    </fieldset>
  );
}

export function TimingFields({
  value,
  deadline,
  errors = {},
}: {
  value?: string | null;
  deadline?: string | null;
  errors?: SchoolNeedFieldErrors;
}) {
  const parsed = parseTiming(value);
  const from = parsed?.from ?? "";
  const until = parsed ? (parsed.until ?? "") : (deadline ?? "");
  const untilRef = useRef<HTMLInputElement>(null);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Waktu pelaksanaan</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label>
            Mulai
            <input
              name="timingFrom"
              type="date"
              required
              defaultValue={from}
              {...errorAttributes("timingFrom", errors)}
              onChange={(event) => {
                if (untilRef.current) untilRef.current.min = event.currentTarget.value;
              }}
            />
          </label>
          <FieldError name="timingFrom" message={errors.timingFrom} />
        </div>
        <div>
          <label>
            Selesai (opsional)
            <input
              ref={untilRef}
              name="timingUntil"
              type="date"
              min={from || undefined}
              defaultValue={until}
              {...errorAttributes("timingUntil", errors)}
            />
          </label>
          <FieldError name="timingUntil" message={errors.timingUntil} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Tanggal selesai opsional. Jika diisi, tanggal ini juga menjadi batas waktu respons alumni.
      </p>
      {value && !parsed && (
        <p className="text-sm">
          Jadwal sebelumnya: {value}. Pilih tanggal mulai dan selesai untuk menyimpan perubahan.
        </p>
      )}
    </fieldset>
  );
}

export function LocationFields({
  defaultMode = "",
  defaultDetails = "",
  errors = {},
}: {
  defaultMode?: LocationMode | "";
  defaultDetails?: string | null;
  errors?: SchoolNeedFieldErrors;
}) {
  const [mode, setMode] = useState<LocationMode | "">(defaultMode);
  const [details, setDetails] = useState(
    defaultDetails || (defaultMode === "on-site" ? schoolLocation : "")
  );
  const requiresDetails = mode === "on-site" || mode === "off-site";

  function changeMode(next: LocationMode) {
    if (next === "on-site") setDetails(schoolLocation);
    else if (next === "off-site" && mode === "on-site") setDetails("");
    else if (next === "remote" && details === schoolLocation) setDetails("");
    setMode(next);
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="block">
          Lokasi kegiatan
          <select
            name="locationMode"
            required
            value={mode}
            onChange={(event) => changeMode(event.currentTarget.value as LocationMode)}
            {...errorAttributes("locationMode", errors)}
          >
            <option value="" disabled>
              Pilih lokasi
            </option>
            {locationModes.map((locationMode) => (
              <option key={locationMode} value={locationMode}>
                {locationModeLabels[locationMode]}
              </option>
            ))}
          </select>
        </label>
        <FieldError name="locationMode" message={errors.locationMode} />
      </div>
      <div>
        <label className="block">
          Alamat/lokasi
          <input
            name="locationDetails"
            maxLength={500}
            required={requiresDetails}
            value={details}
            onChange={(event) => setDetails(event.currentTarget.value)}
            placeholder={
              mode === "off-site"
                ? "Nama dan alamat lokasi di luar sekolah"
                : mode === "on-site"
                  ? schoolLocation
                  : "Opsional"
            }
            {...errorAttributes("locationDetails", errors)}
          />
        </label>
        <FieldError name="locationDetails" message={errors.locationDetails} />
      </div>
      <p className="text-sm text-muted-foreground">
        {mode === "on-site"
          ? "Alamat/lokasi sekolah terisi otomatis. Anda dapat mengubahnya bila perlu."
          : mode === "off-site"
            ? "Wajib diisi dengan nama dan alamat lokasi di luar sekolah."
            : mode === "remote"
              ? "Alamat/lokasi opsional untuk kegiatan jarak jauh."
              : "Pilih lokasi kegiatan terlebih dahulu."}
      </p>
    </div>
  );
}

export function InitiativeLinkField({
  defaultValue,
  error,
}: {
  defaultValue?: string | null;
  error?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const message = error ?? localError;

  function checkLink() {
    const input = inputRef.current;
    if (!input) return;
    const result = normalizeInitiativeLink(input.value);
    input.value = result.value;
    input.setCustomValidity(result.valid ? "" : "Masukkan tautan yang valid.");
    setLocalError(
      result.valid ? null : "Masukkan tautan yang valid, misalnya https://contoh.sch.id/kegiatan."
    );
  }

  return (
    <div>
      <label htmlFor={id}>Tautan inisiatif (opsional)</label>
      <input
        ref={inputRef}
        id={id}
        name="initiativeLink"
        type="url"
        inputMode="url"
        maxLength={500}
        defaultValue={defaultValue ?? ""}
        aria-invalid={message ? true : undefined}
        aria-describedby={`${id}-hint${message ? ` ${id}-error` : ""}`}
        onBlur={checkLink}
        onChange={(event) => {
          event.currentTarget.setCustomValidity("");
          if (localError) setLocalError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") checkLink();
        }}
        onPaste={(event) => {
          const result = normalizeInitiativeLink(event.clipboardData.getData("text"));
          if (!result.valid || !result.value) return;
          event.preventDefault();
          event.currentTarget.value = result.value;
          event.currentTarget.setCustomValidity("");
          setLocalError(null);
        }}
      />
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        Tanpa https:// akan dilengkapi otomatis. Contoh: https://contoh.sch.id/kegiatan
      </p>
      {message && (
        <span id={`${id}-error`} className="field-error" aria-live="polite">
          {message}
        </span>
      )}
    </div>
  );
}
