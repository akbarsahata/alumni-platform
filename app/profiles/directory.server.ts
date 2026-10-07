import { taxonomyRepository } from "../db/taxonomy.repository.server";
import { requireDirectory } from "../authorization/permissions.server";
import { directoryRepository } from "../db/directory.repository.server";
import { directorySearchInput, parseInput } from "../http/validation";
import { profileEligibilityReason } from "./eligibility";
import { readLocationValues, selectedLocationOptions } from "./locations";
export async function searchDirectory(request: Request, env: Env, profileId?: string) {
  await requireDirectory(request, env);
  const params = new URL(request.url).searchParams;
  const query = parseInput(
    directorySearchInput,
    {
      ...Object.fromEntries([...params].filter(([, v]) => v !== "")),
      ...(params.getAll("city").filter(Boolean).length
        ? { city: params.getAll("city").filter(Boolean) }
        : {}),
      ...(params.getAll("country").filter(Boolean).length
        ? { country: params.getAll("country").filter(Boolean) }
        : {}),
    },
    "Filter pencarian tidak valid."
  );
  const includes = (value: string, needle?: string) =>
    !needle || value.toLocaleLowerCase("id").includes(needle.toLocaleLowerCase("id"));
  const tags = await taxonomyRepository(env.DB).tags();
  const candidates = await directoryRepository(env.DB).candidates();
  const profiles = candidates
    .filter((p) => profileEligibilityReason({ ...p, membershipStatus: "approved" }) === null)
    .map(({ locationFormat, participation: _participation, ...p }) => ({
      ...p,
      city: selectedLocationOptions(readLocationValues(p.city, locationFormat, "city"), "city").map(
        (o) => o.label
      ),
      country: selectedLocationOptions(
        readLocationValues(p.country, locationFormat, "country"),
        "country"
      ).map((o) => o.label),
    }));
  if (profileId) {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) throw new Response("Profil tidak tersedia.", { status: 404 });
    return { profiles: [profile], nextCursor: null, tags };
  }
  const matches = profiles.filter(
    (p) =>
      (!query.expertise || p.expertiseTags.includes(query.expertise)) &&
      includes(p.introduction, query.introduction) &&
      (!query.city?.length ||
        selectedLocationOptions(query.city, "city").some((o) =>
          includes(p.city.join(" "), o.label.startsWith("Lokasi sebelumnya: ") ? o.value : o.label)
        )) &&
      (!query.country?.length ||
        selectedLocationOptions(query.country, "country").some((o) =>
          includes(
            p.country.join(" "),
            o.label.startsWith("Lokasi sebelumnya: ") ? o.value : o.label
          )
        )) &&
      (!query.helpType || p.helpTypes.includes(query.helpType)) &&
      (!query.availability || p.availability === query.availability) &&
      (query.graduationFrom === undefined ||
        (p.studentType === "graduate" &&
          p.graduationYear !== null &&
          p.graduationYear >= query.graduationFrom)) &&
      (query.graduationTo === undefined ||
        (p.studentType === "graduate" &&
          p.graduationYear !== null &&
          p.graduationYear <= query.graduationTo)) &&
      (query.attendanceFrom === undefined ||
        (p.studentType === "former-student" &&
          p.attendanceEnd !== null &&
          p.attendanceEnd >= query.attendanceFrom)) &&
      (query.attendanceTo === undefined ||
        (p.studentType === "former-student" &&
          p.attendanceStart !== null &&
          p.attendanceStart <= query.attendanceTo)) &&
      (!query.cursor || p.id > query.cursor)
  );
  return {
    profiles: matches.slice(0, 50),
    nextCursor: matches.length > 50 ? matches[49].id : null,
    tags,
  };
}
