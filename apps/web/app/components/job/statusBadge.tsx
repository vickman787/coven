"use client";

export const STATUS_STYLE: Record<string, string> = {
  complete: "bg-[#7c3aed]/15 text-[#a78bfa] border-[#7c3aed]/40",
  done: "bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/40",
  failed: "bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/40",
  paid: "bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/40",
  reserved: "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40",
  revoked: "bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/40",
  running: "bg-[#7c3aed]/15 text-[#a78bfa] border-[#7c3aed]/40",
  settled: "bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/40",
  unresolved: "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40",
};

export function statusBadge(status: string) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? "bg-white/10 text-[#9a9ab0]"}`}
    >
      {status}
    </span>
  );
}
