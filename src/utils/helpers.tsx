import type { ReactNode } from "react";

export function formatTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Parses **bold** and [n] citation markers into React nodes. */
export function renderInline(text: string, onCit?: (n: number) => void): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((t, i) => {
    if (t.startsWith("**") && t.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {t.slice(2, -2)}
        </strong>
      );
    }
    const m = t.match(/^\[(\d+)\]$/);
    if (m) {
      const n = +m[1];
      return (
        <button
          key={i}
          onClick={() => onCit?.(n)}
          className="citation-btn"
          aria-label={`View source ${n}`}
        >
          {n}
        </button>
      );
    }
    return <span key={i}>{t}</span>;
  });
}
