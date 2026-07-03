"use client";

import { useState } from "react";

export function CopyInvite({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/join/${code}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers/contexts without clipboard API.
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" onClick={copy} className="btn-secondary text-xs">
      {copied ? "✓" : "🔗"} {label}
    </button>
  );
}
