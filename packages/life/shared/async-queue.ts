export class AsyncQueue<T> implements AsyncIterator<T>, AsyncIterable<T> {
  #buf: T[] = [];
  #wakeUp?: () => void;
  #closed = false;

  push(v: T) {
    if (this.#closed) return;
    this.#buf.push(v);
    this.#wakeUp?.();
  }

  pushFirst(v: T) {
    if (this.#closed) return;
    this.#buf.unshift(v);
    this.#wakeUp?.();
  }

  stop() {
    if (this.#closed) return;
    this.#closed = true;
    this.#wakeUp?.();
  }

  some(predicate: (value: T) => boolean) {
    return this.#buf.some(predicate);
  }

  length() {
    return this.#buf.length;
  }

  async next(): Promise<IteratorResult<T>> {
    while (true) {
      const value = this.#buf.shift();
      if (value !== undefined) return { value, done: false };
      if (this.#closed) return { value: undefined, done: true };
      await new Promise<void>((res) => (this.#wakeUp = res)); // sleep until push/stop
      this.#wakeUp = undefined;
    }
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
