import Link from "next/link";
import type { BookWithPeople } from "@/lib/types";
import type { Translator } from "@/lib/i18n";
import { driveBetween } from "@/lib/geo";
import { StatusBadge } from "./StatusBadge";

export function BookCard({
  book,
  t,
  viewerZip,
}: {
  book: BookWithPeople;
  t: Translator;
  viewerZip?: string | null;
}) {
  const location = book.location_zip;
  const drive = driveBetween(viewerZip, book.location_zip);

  return (
    <Link href={`/books/${book.id}`} className="card flex gap-3 p-3">
      <div className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-stone-100">
        {book.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.cover_image_url}
            alt={book.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            📕
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-medium leading-snug">{book.title}</h3>
          <StatusBadge status={book.status} t={t} />
        </div>
        {book.author ? (
          <p className="mt-0.5 truncate text-sm text-stone-500">{book.author}</p>
        ) : null}
        {book.isbn ? (
          <p className="mt-0.5 truncate font-mono text-xs text-stone-400">
            ISBN: {book.isbn}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-2 text-xs text-stone-500">
          <span className="truncate font-medium text-brand-700">
            {t("book.owner")}: {book.owner_name}
          </span>
          <span className="truncate font-medium text-emerald-700">
            {t("book.holder")}: {book.holder_name}
          </span>
          {location ? <span className="truncate">📍 {location}</span> : null}
          {drive ? (
            <span className="truncate text-stone-600">
              🚗 {t("card.drive", { min: drive.minutes })}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <span
            className={`chip ${
              book.share_mode === "lend" ? "mode-chip--lend" : "mode-chip--flow"
            }`}
          >
            {book.share_mode === "lend" ? "↩️" : "🔄"} {t(`mode.${book.share_mode}`)}
          </span>
          {book.share_mode === "lend" && book.visible_to_others === 0 ? (
            <span className="chip bg-stone-100 text-stone-600">
              {t("book.hiddenBadge")}
            </span>
          ) : null}
          {book.language ? (
            <span className="chip bg-stone-100 text-stone-600">{book.language}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
