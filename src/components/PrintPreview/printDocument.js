// Builds the standalone HTML documents the Print Preview renders and prints.
// All documents are Folio (8.5 × 13 in); orientation and margin vary.

export const PRINT_PAPER = "Folio";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function htmlDocument({ title = "Report", body, css = "", orientation = "portrait", margin = 0.35 }) {
  const size = orientation === "landscape" ? "13in 8.5in" : "8.5in 13in";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${size}; margin: ${margin}in; }
html, body { margin: 0; padding: 0; background: #fff; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
<style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

// Images are embedded as data: URLs scaled down to what the printed size
// needs (~300 dpi). A full-size logo repeated on every page would otherwise
// make a many-class report too large to print.
const embedCache = new Map();

async function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function encodeImage(src, maxPx) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  if (!longest) throw new Error("Empty image");
  if (longest <= maxPx) return readAsDataUrl(await (await fetch(src)).blob());
  const scale = maxPx / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function toDataUrl(src, maxPx) {
  if (!src || src.startsWith("data:")) return Promise.resolve(src);
  const key = `${maxPx}|${src}`;
  if (!embedCache.has(key)) {
    embedCache.set(key, encodeImage(src, maxPx).catch(() => {
      embedCache.delete(key);
      return src;
    }));
  }
  return embedCache.get(key);
}

// Embeds every <img> of a finished HTML document as a data: URL. The print
// window loads the document from a temp file, where the app's relative asset
// URLs would not resolve.
export async function inlineDocumentImages(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const images = Array.from(parsed.images);
  if (!images.length) return html;
  await Promise.all(images.map(async (img) => {
    const src = img.getAttribute("src");
    if (!src || src.startsWith("data:")) return;
    // Printed logos are at most a few inches wide.
    img.setAttribute("src", await toDataUrl(new URL(src, document.baseURI).href, 900));
    img.removeAttribute("srcset");
  }));
  return `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
}

// Clones the on-screen sheet(s) into a self-contained document styled only by
// `options.css` (the sheet's own stylesheet, imported with ?raw), so app-wide
// print rules cannot hide it. Images are embedded so the hidden print window
// needs nothing from the dev server or the app bundle.
export async function documentFromElement(element, options = {}) {
  const clone = element.cloneNode(true);
  const sourceImages = element.querySelectorAll("img");
  const cloneImages = clone.querySelectorAll("img");
  await Promise.all(
    Array.from(cloneImages, async (img, index) => {
      const source = sourceImages[index];
      // 4 image pixels per on-screen CSS pixel (96 per inch) is about 400 dpi.
      const shown = Math.max(source?.clientWidth || 0, source?.clientHeight || 0);
      img.setAttribute("src", await toDataUrl(source?.currentSrc || source?.src, Math.max(128, Math.ceil(shown * 4))));
      img.removeAttribute("srcset");
    }),
  );
  clone.querySelectorAll(".no-print").forEach((node) => node.remove());
  return htmlDocument({ ...options, body: clone.outerHTML });
}

export { escapeHtml };
