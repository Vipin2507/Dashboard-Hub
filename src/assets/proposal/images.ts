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
  const out: Record<string, string> = {};
  for (const [key, url] of Object.entries(entries)) {
    out[key] = await loadImageAsBase64(url);
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

export const PROPOSAL_IMAGE_URLS = {
  coverBg: coverBgUrl,
  logoBuildesk: logoBuildeskUrl,
  logoCravingcode: logoCravingcodeUrl,
  meetingPhoto: meetingPhotoUrl,
  blueArrow: blueArrowUrl,
} as const;
