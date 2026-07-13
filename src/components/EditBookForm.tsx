"use client";

import { useCallback, useState } from "react";
import { updateBookAction } from "@/app/actions";
import { BarcodeScanner } from "./BarcodeScanner";
import type { AddBookLabels } from "./AddBookForm";

export interface EditBookLabels extends AddBookLabels {
  editHint: string;
  isbnLabel: string;
}

type LookupState = "idle" | "looking" | "found" | "notfound";

function mapLanguage(code: string | null): string {
  if (!code) return "";
  if (code.toLowerCase().startsWith("zh")) return "中文";
  if (code.toLowerCase().startsWith("en")) return "English";
  return code;
}

export function EditBookForm({
  book,
  labels,
}: {
  book: {
    id: string;
    isbn: string | null;
    title: string;
    author: string | null;
    language: string | null;
    condition: string | null;
    notes: string | null;
    deposit: string | null;
    share_mode: "flow" | "lend";
    visible_to_others: number;
    cover_image_url: string | null;
  };
  labels: EditBookLabels;
}) {
  const [isbn, setIsbn] = useState(book.isbn ?? "");
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author ?? "");
  const [language, setLanguage] = useState(book.language ?? "");
  const [coverUrl, setCoverUrl] = useState(book.cover_image_url ?? "");
  const [shareMode, setShareMode] = useState<"flow" | "lend">(book.share_mode);
  const [lookup, setLookup] = useState<LookupState>("idle");
  const [showScanner, setShowScanner] = useState(false);

  const doLookup = useCallback(async (code: string) => {
    const clean = code.replace(/[^0-9Xx]/g, "");
    if (clean.length !== 10 && clean.length !== 13) return;
    setLookup("looking");
    try {
      const res = await fetch(`/api/isbn/${clean}`);
      if (!res.ok) {
        setLookup("notfound");
        return;
      }
      const meta = await res.json();
      if (meta.title) setTitle(meta.title);
      if (meta.authors?.length) setAuthor(meta.authors.join(", "));
      const lang = mapLanguage(meta.language);
      if (lang) setLanguage(lang);
      if (meta.cover_url) setCoverUrl(meta.cover_url);
      setLookup("found");
    } catch {
      setLookup("notfound");
    }
  }, []);

  const onScanned = useCallback(
    (code: string) => {
      setShowScanner(false);
      setIsbn(code.replace(/[^0-9Xx]/g, ""));
      void doLookup(code);
    },
    [doLookup]
  );

  return (
    <>
      {showScanner ? (
        <BarcodeScanner
          onDetected={onScanned}
          onClose={() => setShowScanner(false)}
          labels={{
            scanning: labels.scanning,
            close: labels.close,
            noCamera: labels.noCamera,
          }}
        />
      ) : null}

      <form action={updateBookAction} className="card space-y-4 p-4">
        <input type="hidden" name="book_id" value={book.id} />
        <input type="hidden" name="cover_url" value={coverUrl} />
        <input type="hidden" name="share_mode" value={shareMode} />

        <p className="text-sm text-stone-500">{labels.editHint}</p>

        {/* How to share */}
        <div>
          <span className="label">{labels.modeTitle}</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { v: "flow", title: labels.modeFlow, desc: labels.modeFlowDesc },
                { v: "lend", title: labels.modeLend, desc: labels.modeLendDesc },
              ] as const
            ).map((opt) => {
              const active = shareMode === opt.v;
              return (
                <button
                  type="button"
                  key={opt.v}
                  onClick={() => setShareMode(opt.v)}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100"
                      : "border-stone-300 bg-white"
                  }`}
                >
                  <span
                    className={`chip ${
                      opt.v === "lend" ? "mode-chip--lend" : "mode-chip--flow"
                    }`}
                  >
                    {opt.v === "flow" ? "🔄 " : "↩️ "}
                    {opt.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {shareMode === "lend" ? (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="deposit">
                {labels.depositLabel}
              </label>
              <input
                id="deposit"
                name="deposit"
                defaultValue={book.deposit ?? ""}
                placeholder={labels.depositPlaceholder}
                className="input"
              />
              <p className="mt-1 text-xs text-stone-400">{labels.depositHint}</p>
            </div>
            <label className="flex items-start gap-2 rounded-xl bg-stone-50 p-3">
              <input
                type="checkbox"
                name="visible_to_others"
                defaultChecked={book.visible_to_others !== 0}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-stone-700">
                  {labels.visibilityLabel}
                </span>
                <span className="mt-0.5 block text-xs text-stone-500">
                  {labels.visibilityHint}
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {/* ISBN + optional re-lookup */}
        <div className="rounded-xl bg-brand-50 p-3">
          <label className="text-sm font-semibold text-brand-800" htmlFor="isbn">
            {labels.isbnLabel}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="isbn"
              name="isbn"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              inputMode="numeric"
              placeholder={labels.isbnPlaceholder}
              className="input flex-1"
            />
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="btn-primary whitespace-nowrap px-3"
            >
              📷 {labels.scan}
            </button>
          </div>
          <button
            type="button"
            onClick={() => doLookup(isbn)}
            disabled={lookup === "looking"}
            className="btn-secondary mt-2 w-full"
          >
            {lookup === "looking" ? labels.looking : `🔎 ${labels.lookup}`}
          </button>
          {lookup === "found" ? (
            <p className="mt-2 text-xs text-emerald-600">✓ {labels.found}</p>
          ) : null}
          {lookup === "notfound" ? (
            <p className="mt-2 text-xs text-amber-600">{labels.notFound}</p>
          ) : null}
        </div>

        {coverUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt={title}
              className="h-24 w-16 rounded-lg object-cover"
            />
            <span className="text-xs text-stone-400">{labels.fieldCover}</span>
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="title">
            {labels.fieldTitle}
          </label>
          <input
            id="title"
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="author">
            {labels.fieldAuthor}{" "}
            <span className="text-stone-400">({labels.optional})</span>
          </label>
          <input
            id="author"
            name="author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="input"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="language">
              {labels.fieldLanguage}
            </label>
            <input
              id="language"
              name="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="condition">
              {labels.fieldCondition}
            </label>
            <input
              id="condition"
              name="condition"
              defaultValue={book.condition ?? ""}
              placeholder={labels.conditionPlaceholder}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="cover">
            {labels.fieldCoverReplace}{" "}
            <span className="text-stone-400">({labels.optional})</span>
          </label>
          <input id="cover" name="cover" type="file" accept="image/*" className="input" />
        </div>

        <div>
          <label className="label" htmlFor="notes">
            {labels.fieldNotes}{" "}
            <span className="text-stone-400">({labels.optional})</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={book.notes ?? ""}
            className="input"
          />
        </div>

        <button type="submit" className="btn-primary w-full">
          {labels.submit}
        </button>
      </form>
    </>
  );
}
