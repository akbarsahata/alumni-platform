# Shared navigation and guest homepage

## Accepted decisions — 2026-10-07

Option B, grouped top-bar navigation, is the selected design. Breadcrumbs and a signed-in actionable home dashboard are deferred.

Guests see the welcome typography, school introduction and existing email-code login form directly on `/`, without a menu bar. `/login` renders the same presentation and preserves invitation-return and email-change flows. Both routes use the same authentication action, including origin checks, resend, validation and verified session creation. The welcome content is rendered as accessible HTML, rather than the screenshot itself.

Signed-in users see a short welcome on `/` and shared navigation on existing routes in all builds. Home uses an icon. Personal, directory and administration groups contain implemented destinations available to the current account; server-loaded membership and current permissions control visibility. Multiple roles combine their menus. Finance, staff and student assignments have no additional implemented destinations yet. Backend authorization remains authoritative.

The bar scrolls with the document. Group/account dropdowns are mutually exclusive and close on outside click, Escape or navigation. Each group has one caret. The account trigger is a circular 44×44px user icon. Email and the POST sign-out action appear in its dropdown; sign-out has a logout icon and red action styling. Redundant page-level Beranda links are removed; related-feature and parent-list links remain.

Only the real primary administrator sees “Pratinjau peran” in the account menu. The preview panel starts hidden. Selected role combinations simulate menu visibility without changing server permissions. The primary toggle remains available while simulating another role. Preview state stays in memory across client navigation, resets on reload/account change, and becomes inactive when primary authority is absent. A close control restores actual menus. Old URL preview parameters have no effect.

## Prototype capture

The original A/B/C variants, floating switcher and initial role-preview controls are preserved on local branch `codex/navigation-prototype`, snapshot `b31b386f1c64b1b29add9b33d8f3333d7dc4940d`. Only the selected implementation remains on `master`. No implementation issue was requested or created for this refinement.

Run `npm run dev` and open `http://localhost:5173/`.

## Verification

Typecheck, lint and production build pass. Desktop and 390px Chromium checks confirm guest home/login presentation, no guest menus and no horizontal overflow. Captured-email browser journeys verify login directly on `/`, returning login on `/login`, logout and correct account identity across routes and mobile layouts. Focused account HTTP checks pass.

Primary preview was checked against real Worker/D1 fixtures: the toggle is absent for a directory coordinator, off by default for primary, supports combined roles, preserves API denial despite directory preview, fits mobile, closes through the account menu and resets on reload. Directory-focused verification previously passed six helper tests, five HTTP journeys and one Chromium coordinator journey. Final authentication verification is recorded in the handoff.

Final verification: the full `npm test` run passes six helpers, 64 HTTP tests and 13 Chromium journeys, including real OTP expiry, guest login, primary-only preview and a delayed-hydration regression. Typecheck, lint, formatting and production build pass. Changes remain local and uncommitted; no remote pipeline rerun, deployment or live email.
