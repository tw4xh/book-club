import { osmEmbedUrl } from "@/lib/geo";

/**
 * Embedded OpenStreetMap view centered on a zip code. Uses OSM's public embed
 * iframe so there is no API key or map library needed.
 */
export function LocationMap({
  zip,
  title,
}: {
  zip: string | null | undefined;
  title: string;
}) {
  const src = osmEmbedUrl(zip);
  if (!src) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200">
      <iframe
        title={title}
        src={src}
        loading="lazy"
        className="h-52 w-full"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
