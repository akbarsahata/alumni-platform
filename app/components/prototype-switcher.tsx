import { useEffect, useCallback } from "react";
import { useSearchParams } from "react-router";
const variants = [
  ["A", "Dua kolom"],
  ["B", "Tiga kolom"],
  ["C", "Per bagian"],
];
export function PrototypeSwitcher() {
  const [params, setParams] = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex(([key]) => key === params.get("variant"))
  );
  const cycle = useCallback(
    (direction: number) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set("variant", variants[(index + direction + variants.length) % variants.length][0]);
          return next;
        },
        { replace: true, preventScrollReset: true }
      );
    },
    [index, setParams]
  );
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        !(event.target instanceof HTMLElement) ||
        event.target.closest(
          "input, textarea, select, [contenteditable], [role=combobox], [role=listbox]"
        )
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        cycle(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cycle]);
  if (!import.meta.env.DEV) return null;
  return (
    <nav className="prototype-switcher" aria-label="Pilihan prototipe">
      <button type="button" aria-label="Variasi sebelumnya" onClick={() => cycle(-1)}>
        ←
      </button>
      <span>
        {variants[index][0]} · {variants[index][1]}
      </span>
      <button type="button" aria-label="Variasi berikutnya" onClick={() => cycle(1)}>
        →
      </button>
    </nav>
  );
}
