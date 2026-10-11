/**
 * Save a generated file. On claude.ai the page runs in a sandbox, so files go
 * through the Artifact `downloads` capability (the viewer confirms the save).
 * Elsewhere it falls back to a normal browser download.
 */
type DownloadsApi = { save(req: { filename: string; data: Blob }): Promise<unknown> };

let downloadsPromise: Promise<DownloadsApi | null> | null = null;

function getDownloads(): Promise<DownloadsApi | null> {
  const claude = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
  if (!claude?.use) return Promise.resolve(null);
  downloadsPromise ??= claude.use("downloads").then((d) => (d as DownloadsApi) ?? null).catch(() => null);
  return downloadsPromise;
}

function browserDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveFile(filename: string, blob: Blob): Promise<void> {
  const downloads = await getDownloads();
  if (!downloads) {
    browserDownload(filename, blob);
    return;
  }
  try {
    await downloads.save({ filename, data: blob });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "declined") return;
    console.warn("Download failed:", code, err);
  }
}
