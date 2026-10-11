/**
 * Jump between the Connection Rack and the Destination Drops plan.
 * The target is handed over in sessionStorage, then the page navigates.
 */
export type FocusRequest = { type: "drop"; id: string } | { type: "cable"; id: string };

const KEY = "multivrz_focus_request";

export function requestFocus(request: FocusRequest) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(request));
  } catch {
    /* ignore */
  }
}

/** Read and clear a pending request of the given type. */
export function takeFocus(type: FocusRequest["type"]): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const request = JSON.parse(raw) as FocusRequest;
    if (request.type !== type) return null;
    sessionStorage.removeItem(KEY);
    return request.id;
  } catch {
    return null;
  }
}
