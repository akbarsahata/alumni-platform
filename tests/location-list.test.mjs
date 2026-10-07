import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeLocationList, parseLocationList } from "../app/profiles/location-list.ts";

test("empty optional location selections have an empty database representation", () => {
  assert.equal(encodeLocationList([]), "");
  assert.deepEqual(parseLocationList(""), []);
});
test("location lists preserve commas, percent signs and Unicode without ambiguous delimiters", () => {
  const values = ["ID:SS:Palembang", "Kota, Provinsi", "São Paulo", "100%"];
  assert.equal(
    encodeLocationList(values),
    "ID%3ASS%3APalembang,Kota%2C%20Provinsi,S%C3%A3o%20Paulo,100%25"
  );
  assert.deepEqual(
    parseLocationList("ID%3ASS%3APalembang,Kota%2C%20Provinsi,S%C3%A3o%20Paulo,100%25"),
    values
  );
});
test("trimmed duplicate selections encode once in stable selection order", () => {
  assert.equal(encodeLocationList([" ID ", "AU", "ID", "", "  "]), "ID,AU");
  assert.deepEqual(parseLocationList(" ID ,AU,ID,,"), ["ID", "AU"]);
});
test("malformed percent escapes fail instead of silently changing saved locations", () => {
  for (const input of ["%", "%GG", "%E0%A4%A"])
    assert.throws(() => parseLocationList(input), URIError);
});

test("directory location matching normalizes administrative city aliases and punctuation", async () => {
  const { matchesDirectoryLocation: matches } = await import("../app/profiles/location-search.ts");
  for (const name of ["Depok", "Bandung", "Balikpapan", "Banda Aceh"]) {
    const plain = `${name} — Province`;
    const city = `Kota ${name} — Province`;
    assert.equal(matches([plain], [{ value: "canonical", label: city }], "city"), true);
    assert.equal(matches([city], [{ value: "canonical", label: plain }], "city"), true);
  }
  assert.equal(
    matches(
      ["  Kota DEPOK  - Jawa Barat "],
      [{ value: "canonical", label: "Depok — Jawa Barat" }],
      "city"
    ),
    true
  );
  assert.equal(
    matches(
      ["Depok — DI Yogyakarta"],
      [{ value: "canonical", label: "Kota Depok — Jawa Barat" }],
      "city"
    ),
    false
  );
  assert.equal(
    matches(
      ["Kabupaten Bandung — Jawa Barat"],
      [{ value: "canonical", label: "Kota Bandung — Jawa Barat" }],
      "city"
    ),
    false
  );
  assert.equal(
    matches(["Depok — Jawa Barat"], [{ value: "canonical", label: "Depok" }], "city"),
    false
  );
  assert.equal(
    matches(
      ["Lokasi sebelumnya: Kota Depok - Jawa Barat"],
      [{ value: "canonical", label: "Depok — Jawa Barat" }],
      "city"
    ),
    true
  );
  assert.equal(
    matches(
      ["Depok — Jawa Barat"],
      [{ value: "kota depok - jawa barat", label: "Lokasi sebelumnya: kota depok - jawa barat" }],
      "city"
    ),
    true
  );
  assert.equal(matches(["Indonesia"], [{ value: "ID", label: "Indonesia" }], "country"), true);
  assert.equal(matches(["Indonesia"], [{ value: "IN", label: "India" }], "country"), false);
  assert.equal(
    matches(["Depok", "Jawa Barat"], [{ value: "canonical", label: "Depok — Jawa Barat" }], "city"),
    false
  );
});

test("every same-province Kota alias in the catalogue matches in both directions", async () => {
  const { readFileSync } = await import("node:fs");
  const { matchesDirectoryLocation: matches } = await import("../app/profiles/location-search.ts");
  const catalogue = JSON.parse(
    readFileSync(
      new URL("../app/profiles/location-catalogue.generated.json", import.meta.url),
      "utf8"
    )
  );
  const byValue = new Map(catalogue.cities.map((option) => [option.value, option]));
  let aliases = 0;
  for (const city of catalogue.cities) {
    if (!city.legacyName.startsWith("Kota ")) continue;
    const plain = byValue.get(city.value.replace(":Kota ", ":"));
    if (!plain) continue;
    aliases++;
    assert.equal(matches([plain.label], [city], "city"), true, city.value);
    assert.equal(matches([city.label], [plain], "city"), true, plain.value);
  }
  assert.ok(aliases > 1);
});
