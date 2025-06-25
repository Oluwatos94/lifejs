export class RollingBuffer<T> {
  #maxSize: number;
  #buffer: T[] = [];

  constructor(maxSize: number) {
    this.#maxSize = maxSize;
  }

  add(chunk: T) {
    this.#buffer.push(chunk);
    if (this.#buffer.length > this.#maxSize) {
      this.#buffer.splice(0, this.#buffer.length - this.#maxSize);
    }
  }

  get() {
    return this.#buffer;
  }

  empty() {
    this.#buffer.length = 0;
  }

  length() {
    return this.#buffer.length;
  }
}
