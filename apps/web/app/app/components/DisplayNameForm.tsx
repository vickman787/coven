"use client";

import { useCallback, useState } from "react";

/** Settings: display name for the signed-in account. */
export default function DisplayNameForm({
  initialName,
}: {
  initialName: string | null;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setMessage(null);
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 40) {
        setMessage("Display name must be 1–40 characters.");
        return;
      }
      setSaving(true);
      try {
        const res = await fetch("/api/auth/profile", {
          body: JSON.stringify({ displayName: trimmed }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Could not save the display name.");
        }
        setMessage("Saved.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Could not save the display name.");
      } finally {
        setSaving(false);
      }
    },
    [name],
  );

  return (
    <form onSubmit={save} className="mt-4">
      <label htmlFor="displayName" className="block text-sm font-semibold uppercase tracking-wider text-[#f8f7ff]">
        Display name
      </label>
      <input
        id="displayName"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="What should we call you?"
        className="mt-2 w-full rounded-lg border border-white/15 bg-[#0b0b14] p-3 text-[#f8f7ff] outline-none placeholder:text-[#9a9ab0]/60 focus:border-[#7c3aed]"
      />
      {message ? <p className="mt-2 text-sm text-[#9a9ab0]">{message}</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="mt-4 rounded-lg bg-[#f5c518] px-6 py-3 font-bold text-black hover:brightness-110 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save display name"}
      </button>
    </form>
  );
}
