"use client";

import { useState } from "react";

export function CopyText({
  text,
  label,
  copiedLabel,
}: {
  text: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers/contexts without the async clipboard API.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-xs text-stone-600 transition hover:bg-stone-50"
    >
      {copied ? `✓ ${copiedLabel}` : `📋 ${label}`}
    </button>
  );
}
