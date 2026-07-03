import zipcodes from "zipcodes";

export interface ZipLocation {
  zip: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

/** Normalize to a 5-digit US zip, or null if it doesn't look like one. */
export function normalizeZip(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.trim().match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

export function lookupZip(zip: string | null | undefined): ZipLocation | null {
  const norm = normalizeZip(zip);
  if (!norm) return null;
  const info = zipcodes.lookup(norm);
  if (!info) return null;
  return {
    zip: info.zip,
    city: info.city,
    state: info.state,
    lat: info.latitude,
    lng: info.longitude,
  };
}

/** True if the zip exists in the dataset. */
export function isValidZip(zip: string | null | undefined): boolean {
  return lookupZip(zip) !== null;
}

/** Human-friendly "City, ST" label for a zip, falling back to the zip itself. */
export function zipLabel(zip: string | null | undefined): string | null {
  const loc = lookupZip(zip);
  if (!loc) return normalizeZip(zip);
  return `${loc.city}, ${loc.state}`;
}

/** Great-circle distance in miles between two zips, or null if unknown. */
export function distanceMiles(
  fromZip: string | null | undefined,
  toZip: string | null | undefined
): number | null {
  const a = normalizeZip(fromZip);
  const b = normalizeZip(toZip);
  if (!a || !b) return null;
  if (!zipcodes.lookup(a) || !zipcodes.lookup(b)) return null;
  if (a === b) return 0;
  const d = zipcodes.distance(a, b);
  return typeof d === "number" ? d : null;
}

/**
 * Rough driving-time estimate (minutes) from a straight-line distance.
 * Applies a road-winding factor and a tiered average speed. This is an
 * approximation for quick comparison; the "Directions" link gives real ETA.
 */
export function estimateDriveMinutes(straightMiles: number): number {
  const roadMiles = straightMiles * 1.25;
  let mph: number;
  if (straightMiles < 3) mph = 25;
  else if (straightMiles < 15) mph = 35;
  else if (straightMiles < 40) mph = 50;
  else mph = 60;
  return Math.max(1, Math.round((roadMiles / mph) * 60));
}

export interface DriveInfo {
  miles: number;
  minutes: number;
}

/** Distance + estimated drive time between two zips, or null if not computable. */
export function driveBetween(
  fromZip: string | null | undefined,
  toZip: string | null | undefined
): DriveInfo | null {
  const miles = distanceMiles(fromZip, toZip);
  if (miles === null) return null;
  return { miles: Math.round(miles), minutes: estimateDriveMinutes(miles) };
}

/**
 * Bounding box string for an OpenStreetMap embed iframe, centered on the zip.
 * `pad` is in degrees (~0.05 ≈ a few miles of zoom).
 */
export function osmEmbedUrl(zip: string | null | undefined, pad = 0.06): string | null {
  const loc = lookupZip(zip);
  if (!loc) return null;
  const minLon = loc.lng - pad;
  const minLat = loc.lat - pad;
  const maxLon = loc.lng + pad;
  const maxLat = loc.lat + pad;
  const bbox = `${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.lat}%2C${loc.lng}`;
}

/** Directions deep-link that opens real turn-by-turn ETA in the maps app. */
export function directionsUrl(
  fromZip: string | null | undefined,
  toZip: string | null | undefined
): string | null {
  const to = lookupZip(toZip);
  if (!to) return null;
  const dest = `${to.lat},${to.lng}`;
  const from = lookupZip(fromZip);
  if (from) {
    return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${dest}&travelmode=driving`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}
