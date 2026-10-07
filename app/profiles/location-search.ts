import type { LocationKind, LocationOption } from "./locations";

function normalizeLocation(label: string, kind: LocationKind): string {
  const normalized = label
    .replace(/^Lokasi sebelumnya:\s*/i, "")
    .normalize("NFKC")
    .toLocaleLowerCase("id")
    .trim()
    .replace(/\s+[-–—]\s+/g, " | ")
    .replace(/\s+/g, " ");
  // Catalogue city aliases omit "Kota". Keep the province and regency prefix:
  // similarly named places elsewhere, and Kabupaten versus Kota, are distinct.
  return kind === "city" ? normalized.replace(/^kota\s+/, "") : normalized;
}

/** Selected catalogue locations match normalized full labels; text queries remain partial. */
export function matchesDirectoryLocation(
  profileLabels: readonly string[],
  queryOptions: readonly LocationOption[],
  kind: LocationKind
): boolean {
  if (!queryOptions.length) return true;
  return queryOptions.some((option) => {
    const isText = option.label.startsWith("Lokasi sebelumnya: ");
    const needle = normalizeLocation(
      isText ? option.value.replace(/^legacy:/, "") : option.label,
      kind
    );
    return profileLabels.some((label) => {
      const location = normalizeLocation(label, kind);
      return isText ? location.includes(needle) : location === needle;
    });
  });
}
