import { stableDeepStringify } from "./stable-stringify";

// This function deep compares two objects for equality, ignoring the order of keys
export const stableObjectSHA256 = async (obj: Record<string, unknown>) => {
  const json = stableDeepStringify(obj);
  const hashedData = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", hashedData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};
