export function getImageFormat(dataUrl: string): "PNG" | "JPEG" {
  if (!dataUrl?.startsWith("data:")) return "PNG";
  return dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg") ? "JPEG" : "PNG";
}

export function imageDataFormat(dataUrl: string): "PNG" | "JPEG" {
  return getImageFormat(dataUrl);
}
