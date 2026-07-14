"use client";

import { useEffect, useRef } from "react";
import type L from "leaflet";

export type MapBucket = {
  zip: string;
  label: string;
  lat: number;
  lng: number;
  count: number;
  lendCount: number;
  flowCount: number;
  unavailableCount: number;
};

export function BookLocationsLeafletMap({
  buckets,
  modeLabels,
  title,
}: {
  buckets: MapBucket[];
  modeLabels: {
    lend: string;
    flow: string;
    mixed: string;
    reading: string;
  };
  title: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current || mapRef.current || buckets.length === 0) return;
      const leaflet = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      const map = leaflet.map(containerRef.current, {
        scrollWheelZoom: true,
        attributionControl: true,
      });
      mapRef.current = map;

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "&copy; OpenStreetMap contributors",
        })
        .addTo(map);

      const bounds = leaflet.latLngBounds(
        buckets.map((bucket) => [bucket.lat, bucket.lng])
      );

      for (const bucket of buckets) {
        const markerKind = getMarkerKind(bucket);
        const tooltip = getTooltip(bucket, modeLabels);
        const icon = leaflet.divIcon({
          className: "",
          html: `<div class="book-map-marker book-map-marker--${markerKind}${bucket.unavailableCount === bucket.count ? " book-map-marker--reading" : ""}">${bucket.count}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        leaflet
          .marker([bucket.lat, bucket.lng], {
            icon,
            title: tooltip,
          })
          .bindTooltip(tooltip, {
            direction: "top",
            offset: [0, -12],
          })
          .addTo(map);
      }

      if (buckets.length === 1) {
        map.setView([buckets[0].lat, buckets[0].lng], 11);
      } else {
        map.fitBounds(bounds, { padding: [24, 24] });
      }
    }

    initMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [buckets, modeLabels]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={title}
      className="h-64 w-full overflow-hidden rounded-xl border border-stone-200"
    />
  );
}

function getMarkerKind(bucket: MapBucket): "lend" | "flow" | "mixed" {
  if (bucket.lendCount > 0 && bucket.flowCount > 0) return "mixed";
  return bucket.flowCount > 0 ? "flow" : "lend";
}

function getTooltip(
  bucket: MapBucket,
  modeLabels: { lend: string; flow: string; mixed: string; reading: string }
) {
  const reading =
    bucket.unavailableCount > 0
      ? `, ${modeLabels.reading} ${bucket.unavailableCount}`
      : "";
  if (bucket.lendCount > 0 && bucket.flowCount > 0) {
    return `${bucket.label}: ${bucket.count} (${modeLabels.lend} ${bucket.lendCount}, ${modeLabels.flow} ${bucket.flowCount}${reading})`;
  }
  const label = bucket.flowCount > 0 ? modeLabels.flow : modeLabels.lend;
  return `${bucket.label}: ${bucket.count} (${label}${reading})`;
}
