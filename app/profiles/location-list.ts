/** Stable comma-separated storage. Escape each value so commas and percent signs round-trip. */
export function encodeLocationList(values: readonly string[]): string {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .map(encodeURIComponent)
    .join(",");
}
export function parseLocationList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((part) => decodeURIComponent(part.trim()).trim())
        .filter(Boolean)
    ),
  ];
}
