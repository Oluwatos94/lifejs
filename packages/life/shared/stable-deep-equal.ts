import deepStableStringify from "fast-json-stable-stringify";

// This function deep compares two objects for equality, ignoring the order of keys
export const stableDeepEqual = <T extends Record<string, unknown>>(a: T, b: T) => {
  return deepStableStringify(a) === deepStableStringify(b);
};
