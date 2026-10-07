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
