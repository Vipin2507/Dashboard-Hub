import coverBgUrl from "./cover_bg.png";
import logoBuildeskUrl from "./logo_buildesk.png";
import logoCravingcodeUrl from "./logo_cravingcode.png";
import meetingPhotoUrl from "./meeting_photo.jpg";
import blueArrowUrl from "./blue_arrow.png";

/** Vite resolves imports to URLs; fetch + FileReader yields data URLs for jsPDF.addImage */
export async function loadImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

function getImageFormat(dataUrl: string): "PNG" | "JPEG" {
  if (!dataUrl?.startsWith("data:")) return "PNG";
  return dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg") ? "JPEG" : "PNG";
}

/** Preload all proposal template images as data URLs for jsPDF */
export async function preloadProposalImages(): Promise<{
  coverBg: string;
  logoBuildesk: string;
  logoCravingcode: string;
  meetingPhoto: string;
  blueArrow: string;
}> {
  const entries = {
    coverBg: coverBgUrl,
    logoBuildesk: logoBuildeskUrl,
    logoCravingcode: logoCravingcodeUrl,
    meetingPhoto: meetingPhotoUrl,
    blueArrow: blueArrowUrl,
  } as const;

  const presets: Record<keyof typeof entries, PdfImagePreset> = {
    coverBg: { maxEdgePx: 1360, quality: 0.7 },
    logoBuildesk: { maxEdgePx: 640, quality: 0.86 },
    logoCravingcode: { maxEdgePx: 640, quality: 0.86 },
    meetingPhoto: { maxEdgePx: 1500, quality: 0.76 },
    blueArrow: { maxEdgePx: 880, quality: 0.82 },
  };

  const out: Record<string, string> = {};
  for (const [key, url] of Object.entries(entries)) {
    const raw = await loadImageAsBase64(url);
    const preset = presets[key as keyof typeof entries];
    out[key] = preset ? await optimizeImageDataUrlForPdf(raw, preset) : raw;
  }
  return out as {
    coverBg: string;
    logoBuildesk: string;
    logoCravingcode: string;
    meetingPhoto: string;
    blueArrow: string;
  };
}

export function imageDataFormat(dataUrl: string): "PNG" | "JPEG" {
  return getImageFormat(dataUrl);
}

type PdfImagePreset = { maxEdgePx: number; quality: number };

/**
 * Downscale and JPEG-encode template images before jsPDF embeds them.
 * Keeps downloaded proposal PDFs much smaller than raw PNG assets.
 */
async function optimizeImageDataUrlForPdf(dataUrl: string, preset: PdfImagePreset): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  if (!dataUrl.startsWith("data:image")) return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(dataUrl);
          return;
        }
        const edge = Math.max(w, h);
        if (edge > preset.maxEdgePx) {
          const s = preset.maxEdgePx / edge;
          w = Math.max(1, Math.round(w * s));
          h = Math.max(1, Math.round(h * s));
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", preset.quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const PROPOSAL_IMAGE_URLS = {
  coverBg: coverBgUrl,
  logoBuildesk: logoBuildeskUrl,
  logoCravingcode: logoCravingcodeUrl,
  meetingPhoto: meetingPhotoUrl,
  blueArrow: blueArrowUrl,
} as const;
