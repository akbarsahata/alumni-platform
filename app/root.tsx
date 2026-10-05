import {
  isRouteErrorResponse,
  Links,
  Link,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { alumniMessages } from "./content/alumni-messages";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <a className="skip-link" href="#page-content">
          Langsung ke konten
        </a>
        <header className="site-header">
          <Link className="brand" to="/" aria-label="Alumni SMAN Sumsel — beranda">
            <img
              className="brand-logo"
              src="/alumni-logo.png"
              alt=""
              width={787}
              height={787}
              decoding="async"
            />
            <span>
              <span className="brand-kicker">KELUARGA ALUMNI</span>
              <span className="brand-name">SMAN Sumatera Selatan</span>
            </span>
          </Link>
          <a
            className="school-link"
            href="https://www.smansumsel.sch.id/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tentang sekolah <span aria-hidden="true">↗</span>
          </a>
        </header>
        <div id="page-content" className="app-shell" tabIndex={-1}>
          {children}
        </div>
        <footer className="site-footer">
          <span>SMAN Sumatera Selatan</span>
          <span lang="en">{alumniMessages.footer}</span>
        </footer>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Terjadi kesalahan";
  let details = "Silakan coba lagi.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Kesalahan";
    details = error.status === 404 ? "Halaman tidak ditemukan." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
