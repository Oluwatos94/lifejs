/**
 * Wrap an async-iterable so the consumer never gets more than `leadMs`
 * ahead of real time (and never receives a >‒leadMs “burst” after a gap).
 *
 * @param cadenceMs  Expected time between chunks in the original stream.
 * @param leadMs     Maximum positive/negative lead you will allow.
 */
export function throttledAudioQueue(cadenceMs = 10, leadMs = 300) {
  /** Wall-clock time we pegged the *first* chunk to. */
  let anchorWallTime = Date.now();

  /** How many chunks we have *already* forwarded (persists across gaps). */
  let totalChunksEmitted = 0;

  /** Small helper: wait `ms` milliseconds. */
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return async function* <T>(source: AsyncIterable<T>): AsyncIterable<T> {
    for await (const chunk of source) {
      // ----- 1. Compute current lead ---------------------------------------
      const virtualStreamTime = totalChunksEmitted * cadenceMs;
      const wallElapsed = Date.now() - anchorWallTime;
      let lead = virtualStreamTime - wallElapsed; // +ahead / –behind

      // ----- 2. If we’re *too far behind*, slide the anchor forward --------
      if (lead < -leadMs) {
        anchorWallTime += -lead - leadMs; // move anchor just enough
        lead = -leadMs; // now clamped to lower bound
      }

      // ----- 3. If we’re *too far ahead*, pause until we’re inside window --
      if (lead > leadMs) {
        await sleep(lead - leadMs); // throttle down
      }

      // ----- 4. Emit the chunk and advance counters ------------------------
      yield chunk;
      totalChunksEmitted++;
    }
  };
}
