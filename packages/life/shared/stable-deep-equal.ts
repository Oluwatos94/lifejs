import { stableDeepStringify } from "./stable-stringify";

// This function deep compares two objects for equality, ignoring the order of keys
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const stableDeepEqual = <T extends Record<string, any>>(a: T, b: T) => {
  return stableDeepStringify(a) === stableDeepStringify(b);
};
