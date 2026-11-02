import type { ImageExtension } from "@/lib/product-images";

const MAX_SIDE = 1200;
const QUALITY = 0.8;

export type ShrunkImage = { readonly blob: Blob; readonly extension: ImageExtension };

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function shrinkImage(file: File): Promise<ShrunkImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await encode(canvas, "image/webp");
  if (webp?.type === "image/webp") return { blob: webp, extension: "webp" };
  const jpeg = await encode(canvas, "image/jpeg");
  if (!jpeg) throw new Error("Could not prepare the photo");
  return { blob: jpeg, extension: "jpg" };
}
