// Server-side logo fetch for the PDF. The URL has already passed
// isSafeLogoUrl; this adds the transport guards: a short timeout, a hard
// 1 MB cap, PNG/JPEG only, and no redirect following. Any failure returns
// null and the PDF renders without a logo — the download must never fail
// because of branding.

const LOGO_TIMEOUT_MS = 3_000;
const LOGO_MAX_BYTES = 1_024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg"]);

export async function fetchInvoiceLogoBytes(
  url: string
): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
      headers: { accept: "image/png, image/jpeg" },
      cache: "no-store",
    });

    // redirect: "manual" surfaces 3xx as-is; anything outside 200-299 is
    // rejected by !ok.
    if (!response.ok) {
      return null;
    }

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return null;
    }

    const declaredSize = Number(response.headers.get("content-length") ?? NaN);

    if (Number.isFinite(declaredSize) && declaredSize > LOGO_MAX_BYTES) {
      return null;
    }

    if (!response.body) {
      return null;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      received += value.byteLength;

      if (received > LOGO_MAX_BYTES) {
        await reader.cancel();

        return null;
      }

      chunks.push(value);
    }

    if (received === 0) {
      return null;
    }

    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}
