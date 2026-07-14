"use client";

import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

export interface CoverPhotoLabels {
  pick: string;
  editTitle: string;
  rotate: string;
  zoom: string;
  done: string;
  cancel: string;
  replace: string;
  hint: string;
}

// Book covers look best at a 2:3 portrait ratio.
const ASPECT = 2 / 3;
// Cap the stored image so the data URL stays small (works well in the DB).
const MAX_WIDTH = 600;
const JPEG_QUALITY = 0.85;

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (e) => reject(e));
    image.src = url;
  });
}

async function renderCroppedDataUrl(
  imageSrc: string,
  crop: Area,
  rotation: number
): Promise<string> {
  const image = await createImage(imageSrc);
  const rad = (rotation * Math.PI) / 180;
  const bBoxWidth =
    Math.abs(Math.cos(rad) * image.width) + Math.abs(Math.sin(rad) * image.height);
  const bBoxHeight =
    Math.abs(Math.sin(rad) * image.width) + Math.abs(Math.cos(rad) * image.height);

  // Draw the (possibly rotated) whole image onto a scratch canvas.
  const scratch = document.createElement("canvas");
  scratch.width = bBoxWidth;
  scratch.height = bBoxHeight;
  const sctx = scratch.getContext("2d");
  if (!sctx) throw new Error("no 2d context");
  sctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  sctx.rotate(rad);
  sctx.drawImage(image, -image.width / 2, -image.height / 2);

  // Extract just the cropped rectangle.
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = crop.width;
  cropCanvas.height = crop.height;
  const cctx = cropCanvas.getContext("2d");
  if (!cctx) throw new Error("no 2d context");
  cctx.drawImage(
    scratch,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  // Scale down if wider than the cap.
  let output = cropCanvas;
  if (cropCanvas.width > MAX_WIDTH) {
    const scale = MAX_WIDTH / cropCanvas.width;
    const scaled = document.createElement("canvas");
    scaled.width = Math.round(cropCanvas.width * scale);
    scaled.height = Math.round(cropCanvas.height * scale);
    const octx = scaled.getContext("2d");
    if (!octx) throw new Error("no 2d context");
    octx.drawImage(cropCanvas, 0, 0, scaled.width, scaled.height);
    output = scaled;
  }

  return output.toDataURL("image/jpeg", JPEG_QUALITY);
}

export function CoverPhotoInput({
  name = "cover_data",
  labels,
  initialPreview,
}: {
  name?: string;
  labels: CoverPhotoLabels;
  initialPreview?: string | null;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [preview, setPreview] = useState<string | null>(initialPreview ?? null);
  const [dataUrl, setDataUrl] = useState<string>("");

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setEditing(true);
    };
    reader.readAsDataURL(file);
    // Reset so picking the same file again re-triggers change.
    e.target.value = "";
  }, []);

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => {
    setAreaPixels(areaPx);
  }, []);

  const onDone = useCallback(async () => {
    if (!rawSrc || !areaPixels) return;
    const url = await renderCroppedDataUrl(rawSrc, areaPixels, rotation);
    setDataUrl(url);
    setPreview(url);
    setEditing(false);
    setRawSrc(null);
  }, [rawSrc, areaPixels, rotation]);

  const onCancel = useCallback(() => {
    setEditing(false);
    setRawSrc(null);
  }, []);

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={dataUrl} />
      <input
        ref={pickerRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />

      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-24 w-16 flex-shrink-0 rounded-lg border border-stone-200 object-cover"
          />
        ) : (
          <div className="flex h-24 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-stone-300 text-2xl text-stone-300">
            📷
          </div>
        )}
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => pickerRef.current?.click()}
            className="btn-secondary"
          >
            {preview ? labels.replace : labels.pick}
          </button>
          <p className="mt-1 text-xs text-stone-400">{labels.hint}</p>
        </div>
      </div>

      {editing && rawSrc ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
          <div className="flex items-center justify-between p-3 text-white">
            <span className="text-sm font-medium">{labels.editTitle}</span>
            <button type="button" onClick={onCancel} className="text-sm text-white/80">
              ✕ {labels.cancel}
            </button>
          </div>
          <div className="relative flex-1">
            <Cropper
              image={rawSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={ASPECT}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="space-y-3 bg-stone-900 p-4 text-white">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm"
              >
                ↺
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm"
              >
                ↻ {labels.rotate}
              </button>
              <label className="ml-2 flex flex-1 items-center gap-2 text-xs">
                {labels.zoom}
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-lg bg-white/10 py-2 text-sm"
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                onClick={onDone}
                className="btn-primary flex-1 py-2 text-sm"
              >
                {labels.done}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
