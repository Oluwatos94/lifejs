/**
 * Throws if executed in a browser context.
 * @param {string} featureName  Name of the feature that must only run on the server
 */
export function ensureServer(featureName: string) {
  const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
  if (isBrowser) {
    throw new Error(`❌ "${featureName}" is a server-only and must not run in the browser.`);
  }
}
