export function audioChunkToMs(audioChunk: Int16Array, sampleRate = 16000) {
  return audioChunk.length / sampleRate;
}
