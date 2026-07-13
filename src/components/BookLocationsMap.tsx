import Link from "next/link";
import type { Translator } from "@/lib/i18n";
import type { BookWithPeople } from "@/lib/types";
import { directionsUrl, driveBetween, lookupZip } from "@/lib/geo";
import { BookLocationsLeafletMap } from "@/components/BookLocationsLeafletMap";

type LocationBucket = {
  zip: string;
  label: string;
  lat: number;
  lng: number;
  count: number;
  lendCount: number;
  flowCount: number;
  readingCount: number;
  titles: string[];
};

export function BookLocationsMap({
  books,
  viewerZip,
  t,
}: {
  books: BookWithPeople[];
  viewerZip: string | null | undefined;
  t: Translator;
}) {
  const buckets = bucketBooksByZip(books);
  if (buckets.length === 0) return null;

  return (
    <section className="card mb-4 min-w-0 space-y-3 overflow-hidden p-3">
      <div>
        <h2 className="font-medium text-stone-800">{t("catalog.mapTitle")}</h2>
        <p className="mt-0.5 text-xs text-stone-500">{t("catalog.mapHint")}</p>
      </div>

      <div className="space-y-2">
        <BookLocationsLeafletMap
          buckets={buckets}
          modeLabels={{
            lend: t("mode.lend"),
            flow: t("mode.flow"),
            mixed: t("catalog.mapMixed"),
            reading: t("catalog.mapReading"),
          }}
          title={t("catalog.mapTitle")}
        />
        <div className="flex flex-wrap gap-3 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="mode-dot--lend" />
            {t("mode.lend")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="mode-dot--flow" />
            {t("mode.flow")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="book-map-legend-mixed" />
            {t("catalog.mapMixed")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="book-map-legend-reading" />
            {t("catalog.mapReading")}
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        {buckets.map((bucket) => {
          const drive = driveBetween(viewerZip, bucket.zip);
          const directions = directionsUrl(viewerZip, bucket.zip);
          return (
            <div key={bucket.zip} className="min-w-0 rounded-xl bg-stone-50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-700">
                  📍 {bucket.label} · {t("catalog.mapBookCount", { n: bucket.count })}
                </p>
                <p className="mt-0.5 truncate text-xs text-stone-500">
                  {bucket.titles.slice(0, 3).join("、")}
                  {bucket.titles.length > 3 ? "…" : ""}
                </p>
                {directions ? (
                  <Link
                    href={directions}
                    target="_blank"
                    className="mt-1 inline-flex max-w-full text-xs font-medium leading-5 text-brand-600"
                  >
                    <span className="truncate">
                      {drive
                        ? t("catalog.mapDrive", { min: drive.minutes })
                        : t("catalog.mapDirections")}
                    </span>
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function bucketBooksByZip(books: BookWithPeople[]): LocationBucket[] {
  const byZip = new Map<string, LocationBucket>();
  for (const book of books) {
    const loc = lookupZip(book.location_zip);
    if (!loc) continue;
    const existing = byZip.get(loc.zip);
    if (existing) {
      existing.count += 1;
      if (book.share_mode === "flow") {
        existing.flowCount += 1;
      } else {
        existing.lendCount += 1;
      }
      if (book.status === "reading") {
        existing.readingCount += 1;
      }
      existing.titles.push(book.title);
    } else {
      byZip.set(loc.zip, {
        zip: loc.zip,
        label: loc.zip,
        lat: loc.lat,
        lng: loc.lng,
        count: 1,
        lendCount: book.share_mode === "lend" ? 1 : 0,
        flowCount: book.share_mode === "flow" ? 1 : 0,
        readingCount: book.status === "reading" ? 1 : 0,
        titles: [book.title],
      });
    }
  }
  return [...byZip.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}
