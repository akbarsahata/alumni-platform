# Profile layout decision

Selected variant B on 2026-10-07 and adopted it in `008a4d3` on
`codex/profile-layout`. The page, home link and browser title now use
“Profil & Keahlian” (`79d4801`).

- Three parallel groups: “Tentang Anda”, “Keahlian & bantuan” and “Partisipasi”.
  The page uses a maximum width of 1240px to reduce desktop scrolling.
- At widths up to 1000px, use two columns with participation spanning both;
  at widths up to 700px, stack all groups and the status section into one column.
- Keep a sticky save control, small-screen spacing and collapsible identity,
  privacy and confirmation explanations.
- Professional introduction is required on all saves, including server-side
  whitespace validation. Existing blank introductions must be filled before
  explicit reconfirmation. Availability notes remain optional. Both text areas
  use visible writing lines and example placeholders.
- A single “Aktifkan partisipasi” checkbox grants participation consent. The
  separate “Konfirmasi profil masih benar” action is inside “Status relevansi
  profil” (`4a1e9f6`). Email sharing still needs separate introduction consent.

Prototype source: local branch `codex/profile-layout-prototype`, commit `eba3947`.
The three variants remain there. The current application uses its real loaders,
validation and database saves, with no switcher or in-memory save stub.

See the [current handoff](handoff.md) for commit and verification evidence, and the
[profile specification](profiles-expertise-outreach-spec.md) for domain rules.
