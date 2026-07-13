"use client";

import { useEffect, useRef, useState } from "react";

export function CreditPopover({
  creditBalance,
  creditLabel,
  creditHow,
}: {
  creditBalance: number;
  creditLabel: string;
  creditHow: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-200"
        title={`${creditLabel}: ${creditBalance}`}
        aria-expanded={open}
      >
        🪙 <span className="hidden sm:inline">{creditLabel}: </span>
        {creditBalance}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-amber-200 bg-white p-3 text-left text-xs leading-5 text-stone-600 shadow-lg">
          <p className="mb-1 font-semibold text-amber-800">
            🪙 {creditLabel}: {creditBalance}
          </p>
          <p>{creditHow}</p>
        </div>
      ) : null}
    </div>
  );
}
