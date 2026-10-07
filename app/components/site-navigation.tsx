import { useEffect, useRef, useState } from "react";
import { CircleUserRound, LogOut, House, ChevronDown, Eye } from "lucide-react";
import { Form, Link, useLocation, useNavigation } from "react-router";
import "./site-navigation.css";

type NavigationAccess = {
  membership: string;
  permissions: {
    directory: boolean;
    manageRoles: boolean;
    reviewMembership: boolean;
    audit: boolean;
  };
} | null;

export function SiteNavigation({
  access: actualAccess,
  account,
}: {
  access: NavigationAccess;
  account: { email: string } | null;
}) {
  const [previewAccount, setPreviewAccount] = useState<string | null>(null);
  const [previewRoles, setPreviewRoles] = useState<string[]>(["member"]);
  const canPreview = actualAccess?.permissions.manageRoles === true;
  const preview = canPreview && !!account && previewAccount === account.email;
  const access: NavigationAccess = preview
    ? {
        membership: previewRoles.includes("member") ? "approved" : "none",
        permissions: {
          manageRoles: previewRoles.includes("primary"),
          audit: previewRoles.includes("primary"),
          directory: previewRoles.includes("directory"),
          reviewMembership: previewRoles.includes("reviewer"),
        },
      }
    : actualAccess;
  const row = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const busy = useNavigation().state !== "idle";
  function closeMenus() {
    row.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => {
      menu.open = false;
    });
  }
  useEffect(() => {
    closeMenus();
  }, [location.key]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!row.current?.contains(event.target as Node)) closeMenus();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const trigger = row.current?.querySelector<HTMLElement>("details[open] summary");
      closeMenus();
      trigger?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const menus = [
    { path: "/", label: "Beranda", group: "Pribadi" },
    ...(access
      ? [{ path: "/membership", label: "Keanggotaan", group: "Pribadi" }]
      : [{ path: "/login", label: "Masuk", group: "Pribadi" }]),
    ...(access && ["approved", "suspended"].includes(access.membership)
      ? [{ path: "/profile", label: "Profil & Keahlian", group: "Pribadi" }]
      : []),
    ...(access?.permissions.directory
      ? [
          { path: "/directory", label: "Direktori keahlian", group: "Direktori" },
          { path: "/directory/tags", label: "Kelola keahlian", group: "Direktori" },
        ]
      : []),
    ...(access?.permissions.reviewMembership
      ? [{ path: "/admin/membership", label: "Tinjau keanggotaan", group: "Administrasi" }]
      : []),
    ...(access?.permissions.manageRoles
      ? [
          { path: "/admin/roles", label: "Kelola peran", group: "Administrasi" },
          { path: "/admin/invitations", label: "Undangan sekolah", group: "Administrasi" },
          { path: "/admin/email-changes", label: "Perubahan email", group: "Administrasi" },
        ]
      : []),
    ...(access?.permissions.audit
      ? [{ path: "/admin/audit", label: "Riwayat audit", group: "Administrasi" }]
      : []),
  ];

  const active = [...menus]
    .sort((a, b) => b.path.length - a.path.length)
    .find(
      (menu) =>
        menu.path === location.pathname ||
        (menu.path !== "/" && location.pathname.startsWith(menu.path + "/"))
    );
  return (
    <div className="site-navigation">
      <div className="navigation-menu-row" ref={row}>
        <nav className="navigation-groups" aria-label="Menu utama">
          <Link
            className="navigation-home"
            to="/"
            aria-label="Beranda"
            title="Beranda"
            aria-current={location.pathname === "/" ? "page" : undefined}
            onClick={closeMenus}
          >
            <House size={21} aria-hidden="true" />
          </Link>
          {["Pribadi", "Direktori", "Administrasi"]
            .filter((group) => menus.some((menu) => menu.group === group && menu.path !== "/"))
            .map((group) => (
              <details key={group} name="site-navigation">
                <summary
                  className={
                    active?.group === group && active.path !== "/" ? "is-active" : undefined
                  }
                >
                  {group}
                  <ChevronDown size={14} aria-hidden="true" />
                </summary>
                <div>
                  {menus
                    .filter((menu) => menu.group === group && menu.path !== "/")
                    .map((menu) => (
                      <Link
                        key={menu.path}
                        to={menu.path}
                        onClick={closeMenus}
                        aria-current={active?.path === menu.path ? "page" : undefined}
                      >
                        {menu.label}
                      </Link>
                    ))}
                </div>
              </details>
            ))}
        </nav>
        {account && (
          <details className="navigation-account" name="site-navigation">
            <summary aria-label="Menu akun" title="Menu akun">
              <CircleUserRound size={24} aria-hidden="true" />
            </summary>
            <div>
              <p>
                <span className="navigation-account-label">Email akun</span>
                <span>{account.email}</span>
              </p>
              {canPreview && (
                <button
                  className="navigation-preview-toggle"
                  type="button"
                  aria-pressed={preview}
                  onClick={() => {
                    setPreviewAccount(preview ? null : account.email);
                    closeMenus();
                  }}
                >
                  <Eye size={18} aria-hidden="true" />
                  <span>{preview ? "Tutup pratinjau peran" : "Pratinjau peran"}</span>
                </button>
              )}
              <Form method="post" action="/logout">
                <button type="submit" disabled={busy}>
                  <LogOut size={18} aria-hidden="true" />
                  <span>{busy ? "Keluar…" : "Keluar"}</span>
                </button>
              </Form>
            </div>
          </details>
        )}
      </div>
      {preview && (
        <section className="navigation-role-preview" aria-label="Pratinjau peran">
          <div>
            <strong>Pratinjau menu berdasarkan peran</strong>
            <button type="button" onClick={() => setPreviewAccount(null)}>
              Tutup pratinjau
            </button>
          </div>
          <p>Hanya tampilan menu. Akses halaman tetap mengikuti akun asli.</p>
          <fieldset>
            <legend className="sr-only">Peran untuk pratinjau</legend>
            {[
              ["member", "Alumni disetujui"],
              ["primary", "Administrator utama"],
              ["reviewer", "Administrator keanggotaan"],
              ["directory", "Koordinator direktori"],
              ["finance", "Koordinator keuangan"],
              ["staff", "Staf sekolah"],
              ["student", "Perwakilan siswa"],
            ].map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={previewRoles.includes(key)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setPreviewRoles((previous) =>
                      checked ? [...previous, key] : previous.filter((role) => role !== key)
                    );
                    closeMenus();
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </section>
      )}
    </div>
  );
}
