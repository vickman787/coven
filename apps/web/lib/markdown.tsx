import type { ReactNode } from "react";

/** Minimal markdown renderer for the Weaver's brief. No raw HTML. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      return (
        <a
          key={`${keyPrefix}-${i}`}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-[#7c3aed] underline"
        >
          {link[1]}
        </a>
      );
    }
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={`${keyPrefix}-${i}`}>{bold[1]}</strong>;
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export function renderBrief(markdown: string): ReactNode {
  const lines = markdown.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flushList = (key: string) => {
    if (list.length > 0) {
      out.push(
        <ul key={key} className="list-disc space-y-2 pl-6">
          {list.map((item, i) => (
            <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((line, i) => {
    if (line.startsWith("# ")) {
      flushList(`ul-${i}`);
      out.push(
        <h1 key={i} className="mt-2 text-3xl font-bold text-[#f8f7ff]">
          {renderInline(line.slice(2), `h1-${i}`)}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      flushList(`ul-${i}`);
      out.push(
        <h2 key={i} className="mt-6 text-xl font-bold text-[#f8f7ff]">
          {renderInline(line.slice(3), `h2-${i}`)}
        </h2>,
      );
    } else if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList(`ul-${i}`);
    } else {
      flushList(`ul-${i}`);
      out.push(
        <p key={i} className="mt-3 leading-relaxed text-[#f8f7ff]">
          {renderInline(line, `p-${i}`)}
        </p>,
      );
    }
  });
  flushList("ul-end");
  return <div>{out}</div>;
}
