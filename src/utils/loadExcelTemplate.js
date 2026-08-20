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
    const templateBytes = await window.electronAPI.loadBundledTemplate(filename);
    return toArrayBuffer(templateBytes);
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
