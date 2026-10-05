export function loader() {
  throw new Response("Halaman tidak ditemukan.", { status: 404 });
}

export const action = loader;

export default function NotFound() {
  return null;
}
