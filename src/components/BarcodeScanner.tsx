"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
  labels: { scanning: string; close: string; noCamera: string };
}

export function BarcodeScanner({ onDetected, onClose, labels }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    const reader = new BrowserMultiFormatReader(hints);

    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (result, _err, controls) => {
          controlsRef.current = controls;
          if (cancelled) {
            controls.stop();
            return;
          }
          if (result) {
            const text = result.getText();
            // ISBN barcodes are EAN-13 starting with 978 or 979.
            controls.stop();
            onDetected(text);
          }
        }
      )
      .then((controls) => {
        controlsRef.current = controls;
        if (cancelled) controls.stop();
      })
      .catch(() => {
        if (!cancelled) setError(labels.noCamera);
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [onDetected, labels.noCamera]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-sm">{labels.scanning}</span>
        <button
          onClick={onClose}
          className="rounded-lg bg-white/20 px-3 py-1.5 text-sm"
        >
          {labels.close}
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
        />
        {!error ? (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-xl border-2 border-brand-400" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-white">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
