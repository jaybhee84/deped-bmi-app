function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    );
  }
  if (Array.isArray(value?.data)) {
    return Uint8Array.from(value.data).buffer;
  }
  throw new Error("The bundled Excel template returned invalid data.");
}

export async function loadExcelTemplate(filename) {
  if (window.electronAPI?.loadBundledTemplate) {
    try {
      const templateBytes =
        await window.electronAPI.loadBundledTemplate(filename);
      return toArrayBuffer(templateBytes);
    } catch (error) {
      // A renderer update can be active before Electron's main process has
      // restarted with a newly added template allowlist entry. The same
      // bundled file is also available from Vite/public (development) and
      // dist/templates (packaged builds), so continue to that safe fallback.
      console.warn(
        `Electron could not load the bundled ${filename} template; using the static bundled copy.`,
        error,
      );
    }
  }

  const templateUrl = new URL(
    `templates/${encodeURIComponent(filename)}`,
    document.baseURI,
  );
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`Unable to load the ${filename} template.`);
  }
  return response.arrayBuffer();
}
