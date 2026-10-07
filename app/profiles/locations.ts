import catalogue from "./location-catalogue.generated.json";
import { parseLocationList } from "./location-list";
export type LocationOption = { value: string; label: string };
export type LocationKind = "city" | "country";
export const countryOptions: LocationOption[] = catalogue.countries.map(({ value, label }) => ({
  value,
  label,
}));
export const cityOptions: LocationOption[] = catalogue.cities.map(({ value, label }) => ({
  value,
  label,
}));
const entries = { city: catalogue.cities, country: catalogue.countries };
const byValue = {
  city: new Map(cityOptions.map((option) => [option.value, option])),
  country: new Map(countryOptions.map((option) => [option.value, option])),
};
/** Old free-text data is converted only when unambiguous; otherwise retain it for the owner. */
export function readLocationValues(value: string, format: number, kind: LocationKind): string[] {
  if (format === 1) return parseLocationList(value);
  if (!value.trim()) return [];
  const normalized = value.trim().toLocaleLowerCase("id");
  const matches = entries[kind].filter((option) =>
    [option.value, option.label, option.legacyName].some(
      (name) => name.toLocaleLowerCase("id") === normalized
    )
  );
  return matches.length === 1 ? [matches[0].value] : [`legacy:${value}`];
}
export function selectedLocationOptions(
  values: readonly string[],
  kind: LocationKind
): LocationOption[] {
  return values.map(
    (value) =>
      byValue[kind].get(value) ?? {
        value,
        label: `Lokasi sebelumnya: ${value.startsWith("legacy:") ? value.slice(7) : value}`,
      }
  );
}
export function validLocationValues(
  values: readonly string[],
  existing: readonly string[],
  kind: LocationKind
): boolean {
  return values.every(
    (value) => byValue[kind].has(value) || (value.startsWith("legacy:") && existing.includes(value))
  );
}
