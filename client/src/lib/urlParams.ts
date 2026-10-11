/** Query parameters from either the page query string or the hash route (#/build?x=y). */
export function getUrlParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  const q = hash.indexOf("?");
  if (q !== -1) {
    new URLSearchParams(hash.slice(q + 1)).forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }
  return params;
}

/** The query string (with leading "?") to carry across hash routes, or "". */
export function getUrlSearch(): string {
  const s = getUrlParams().toString();
  return s ? `?${s}` : "";
}
