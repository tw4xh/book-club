"use client";

import { useCallback, useState } from "react";
import { addBookAction } from "@/app/actions";
import { BarcodeScanner } from "./BarcodeScanner";

export interface AddBookLabels {
  isbnTitle: string;
  isbnHint: string;
  isbnPlaceholder: string;
  scan: string;
  lookup: string;
  looking: string;
  found: string;
  notFound: string;
  scanning: string;
  close: string;
  noCamera: string;
  manualToggle: string;
  modeTitle: string;
  modeFlow: string;
  modeFlowDesc: string;
  modeLend: string;
  modeLendDesc: string;
  depositLabel: string;
  depositPlaceholder: string;
  depositHint: string;
  visibilityLabel: string;
  visibilityHint: string;
  fieldTitle: string;
  fieldAuthor: string;
  fieldCover: string;
  fieldCoverReplace: string;
  fieldLanguage: string;
  fieldAge: string;
  agePlaceholder: string;
  fieldCategory: string;
  categoryPlaceholder: string;
  fieldCondition: string;
  conditionPlaceholder: string;
  fieldZip: string;
  zipPlaceholder: string;
  fieldNotes: string;
  optional: string;
  submit: string;
}

type LookupState = "idle" | "looking" | "found" | "notfound";

function mapLanguage(code: string | null): string {
  if (!code) return "";
  if (code.toLowerCase().startsWith("zh")) return "中文";
  if (code.toLowerCase().startsWith("en")) return "English";
  return code;
}

export function AddBookForm({
  groupId,
  defaultZip,
  defaultLanguage,
  labels,
}: {
  groupId: string;
  defaultZip: string;
  defaultLanguage: string;
  labels: AddBookLabels;
}) {
  const [isbn, setIsbn] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [category, setCategory] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [shareMode, setShareMode] = useState<"flow" | "lend">("flow");
  const [lookup, setLookup] = useState<LookupState>("idle");
  const [showScanner, setShowScanner] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

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
      if (meta.categories?.length) setCategory(meta.categories[0]);
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

      <form action={addBookAction} className="card space-y-4 p-4">
        <input type="hidden" name="group_id" value={groupId} />
        <input type="hidden" name="cover_url" value={coverUrl} />
        <input type="hidden" name="share_mode" value={shareMode} />

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
                placeholder={labels.depositPlaceholder}
                className="input"
              />
              <p className="mt-1 text-xs text-stone-400">{labels.depositHint}</p>
            </div>
            <label className="flex items-start gap-2 rounded-xl bg-stone-50 p-3">
              <input
                type="checkbox"
                name="visible_to_others"
                defaultChecked
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

        {/* ISBN: the fast path */}
        <div className="rounded-xl bg-brand-50 p-3">
          <h2 className="text-sm font-semibold text-brand-800">{labels.isbnTitle}</h2>
          <p className="mt-0.5 text-xs text-stone-500">{labels.isbnHint}</p>
          <div className="mt-2 flex gap-2">
            <input
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
            <label className="label" htmlFor="age_range">
              {labels.fieldAge}
            </label>
            <input
              id="age_range"
              name="age_range"
              placeholder={labels.agePlaceholder}
              className="input"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="category">
              {labels.fieldCategory}
            </label>
            <input
              id="category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={labels.categoryPlaceholder}
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
              placeholder={labels.conditionPlaceholder}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="location_zip">
            {labels.fieldZip}
          </label>
          <input
            id="location_zip"
            name="location_zip"
            inputMode="numeric"
            defaultValue={defaultZip}
            placeholder={labels.zipPlaceholder}
            className="input"
          />
        </div>

        <details
          open={manualOpen}
          onToggle={(e) => setManualOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-sm text-stone-500">
            {labels.fieldCoverReplace} · {labels.fieldNotes}
          </summary>
          <div className="mt-3 space-y-4">
            <div>
              <label className="label" htmlFor="cover">
                {labels.fieldCoverReplace}{" "}
                <span className="text-stone-400">({labels.optional})</span>
              </label>
              <input
                id="cover"
                name="cover"
                type="file"
                accept="image/*"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="notes">
                {labels.fieldNotes}{" "}
                <span className="text-stone-400">({labels.optional})</span>
              </label>
              <textarea id="notes" name="notes" rows={3} className="input" />
            </div>
          </div>
        </details>

        <button type="submit" className="btn-primary w-full">
          {labels.submit}
        </button>
      </form>
    </>
  );
}
