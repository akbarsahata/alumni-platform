import { Country, City, State } from "country-state-city";
import { writeFile } from "node:fs/promises";
const names = new Intl.DisplayNames(["id"], { type: "region" });
const countries = Country.getAllCountries()
  .map((country) => ({
    value: country.isoCode,
    label: names.of(country.isoCode) || country.name,
    legacyName: country.name,
  }))
  .sort((a, b) => a.label.localeCompare(b.label, "id"));
const provinces = new Map(
  State.getStatesOfCountry("ID").map((state) => [state.isoCode, state.name])
);
const cities = City.getCitiesOfCountry("ID").map((city) => ({
  value: `ID:${city.stateCode}:${city.name}`,
  label: `${city.name} — ${provinces.get(city.stateCode) || city.stateCode}`,
  legacyName: city.name,
}));
if (new Set(cities.map((city) => city.value)).size !== cities.length)
  throw new Error("Duplicate city identifiers in source data");
await writeFile(
  "app/profiles/location-catalogue.generated.json",
  JSON.stringify(
    {
      source:
        "country-state-city@3.2.1; upstream dr5hn/countries-states-cities-database (ODbL-1.0)",
      countries,
      cities,
    },
    null,
    2
  ) + "\n"
);
console.log(`Generated ${countries.length} countries and ${cities.length} Indonesian cities.`);
