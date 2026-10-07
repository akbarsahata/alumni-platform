import { useState } from "react";
import Select, { components, type MultiValueRemoveProps } from "react-select";
import { selectedLocationOptions, type LocationKind, type LocationOption } from "./locations";
function RemoveLocation(props: MultiValueRemoveProps<LocationOption, true>) {
  return (
    <components.MultiValueRemove
      {...props}
      innerProps={{
        ...props.innerProps,
        "aria-label": `Hapus ${props.data.label}`,
        title: `Hapus ${props.data.label}`,
      }}
    />
  );
}
export function LocationSelect({
  kind,
  label,
  description,
  options,
  initialValues,
}: {
  kind: LocationKind;
  label: string;
  description?: string;
  options: LocationOption[];
  initialValues: string[];
}) {
  const [values, setValues] = useState(selectedLocationOptions(initialValues, kind));
  const id = `profile-${kind}`;
  return (
    <div className="profile-location-select">
      <label htmlFor={id}>{label}</label>
      {description && (
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      <Select<LocationOption, true>
        instanceId={id}
        inputId={id}
        aria-describedby={description ? `${id}-description` : undefined}
        name={kind}
        options={options}
        components={{ MultiValueRemove: RemoveLocation }}
        value={values}
        onChange={(selected) => setValues([...selected])}
        isMulti
        isSearchable
        closeMenuOnSelect={false}
        blurInputOnSelect={false}
        placeholder="Ketik untuk mencari…"
        noOptionsMessage={() => "Tidak ada hasil."}
        loadingMessage={() => "Memuat…"}
        aria-label={label}
        classNamePrefix="location"
        maxMenuHeight={240}
        isOptionDisabled={() => values.length >= 20}
        ariaLiveMessages={{
          onChange: ({ label, action }) =>
            action === "select-option"
              ? `${label} dipilih.`
              : action === "remove-value" || action === "pop-value"
                ? `${label} dihapus.`
                : action === "clear"
                  ? "Semua pilihan dihapus."
                  : "",
          guidance: ({ context }) =>
            context === "input"
              ? "Ketik untuk mencari. Gunakan panah atas atau bawah lalu Enter untuk memilih."
              : context === "menu"
                ? "Gunakan panah atas atau bawah lalu Enter untuk memilih. Escape untuk menutup."
                : "Gunakan panah kiri atau kanan untuk memilih lokasi yang akan dihapus.",
          onFilter: ({ resultsMessage }) => resultsMessage,
          onFocus: ({ focused }) => focused.label,
        }}
        screenReaderStatus={({ count }) => `${count} lokasi tersedia.`}
      />
      {values.some((value) => value.value.startsWith("legacy:")) && (
        <p className="text-sm">
          Lokasi sebelumnya belum cocok dengan daftar. Data tetap tersimpan; hapus pilihan lama dan
          pilih penggantinya bila perlu.
        </p>
      )}
    </div>
  );
}
