/**
 * In-page confirmation dialog. The hosted page cannot show the browser's
 * window.confirm(), so destructive actions ask here instead.
 */
export function confirmAction(message: string, confirmLabel = "Confirm"): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,0.55)";
    const box = document.createElement("div");
    box.style.cssText =
      "width:100%;max-width:400px;background:#fff;color:#0f172a;border-radius:10px;padding:20px;box-shadow:0 20px 40px rgba(0,0,0,0.25);font-family:Barlow,system-ui,sans-serif";
    const text = document.createElement("p");
    text.textContent = message;
    text.style.cssText = "margin:0 0 16px;font-size:15px;line-height:1.45";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    const btn = (label: string, primary: boolean) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = primary
        ? "padding:8px 14px;border-radius:6px;border:0;background:#dc2626;color:#fff;font-weight:600;cursor:pointer"
        : "padding:8px 14px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-weight:600;cursor:pointer";
      return b;
    };
    const cancel = btn("Cancel", false);
    const ok = btn(confirmLabel, true);
    const close = (result: boolean) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    cancel.onclick = () => close(false);
    ok.onclick = () => close(true);
    overlay.onclick = (e) => {
      if (e.target === overlay) close(false);
    };
    document.addEventListener("keydown", onKey);
    row.append(cancel, ok);
    box.append(text, row);
    overlay.append(box);
    document.body.append(overlay);
    ok.focus();
  });
}
