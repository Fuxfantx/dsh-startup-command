/**
 * Bounded UTF-8 tail buffer.
 *
 * Chunks stay encoded so trimming drops whole chunks first; the joined string
 * is cached until the next change.
 */
export class OutputBuffer {
  #chunks = []
  #bytes = 0
  #total = 0
  #text = ''
  #dirty = false
  #truncated = false
  #limit

  /** @param limit - maximum retained bytes. */
  constructor(limit) {
    this.#limit = Math.max(1, Math.trunc(limit) || 1)
  }

  /** Retained bytes. */
  get bytes() {
    return this.#bytes
  }

  /** Bytes appended since the last clear, including discarded ones. */
  get total() {
    return this.#total
  }

  /** Whether older output was discarded. */
  get truncated() {
    return this.#truncated
  }

  /**
   * Append one decoded string.
   * @param value - text chunk.
   * @returns true when the buffer changed.
   */
  append(value) {
    if (typeof value !== 'string' || value === '') return false
    const chunk = Buffer.from(value, 'utf8')
    if (chunk.length === 0) return false
    this.#chunks.push(chunk)
    this.#bytes += chunk.length
    this.#total += chunk.length
    this.#dirty = true
    if (this.#bytes > this.#limit) this.#trim()
    else if (this.#chunks.length > 1024) this.#coalesce()
    return true
  }

  /** Discard all retained output. */
  clear() {
    this.#chunks = []
    this.#bytes = 0
    this.#total = 0
    this.#text = ''
    this.#dirty = false
    this.#truncated = false
  }

  /** @returns the retained text. */
  toString() {
    if (!this.#dirty) return this.#text
    this.#text = this.#chunks.length === 0 ? '' : Buffer.concat(this.#chunks).toString('utf8')
    this.#dirty = false
    return this.#text
  }

  /**
   * Read retained text after one whole-buffer byte offset.
   * @param from - byte offset a previous read ended at.
   * @returns the delta, the next offset, and whether the client must replace
   * its copy because the offset is outside the retained tail.
   */
  read(from) {
    const total = this.#total
    const start = total - this.#bytes
    if (!Number.isInteger(from) || from < start || from > total) {
      return { text: this.toString(), next: total, reset: true }
    }
    if (from === total) return { text: '', next: total, reset: false }
    const text = Buffer.concat(this.#chunks).subarray(from - start).toString('utf8')
    return { text, next: total, reset: false }
  }

  /** Drop the oldest bytes, keeping UTF-8 boundaries intact. */
  #trim() {
    this.#truncated = true
    let excess = this.#bytes - this.#limit
    let index = 0
    while (index < this.#chunks.length && this.#chunks[index].length <= excess) {
      excess -= this.#chunks[index].length
      index += 1
    }
    const chunks = this.#chunks.slice(index)
    if (excess > 0 && chunks.length > 0) {
      chunks[0] = chunks[0].subarray(characterStart(chunks[0], excess))
    }
    this.#chunks = chunks
    this.#bytes = 0
    for (const chunk of chunks) this.#bytes += chunk.length
  }

  /** Fold many small chunks into one buffer to bound object overhead. */
  #coalesce() {
    this.#chunks = [Buffer.concat(this.#chunks)]
  }
}

/**
 * @param chunk - encoded chunk.
 * @param offset - byte offset to trim at.
 * @returns the first offset at or after `offset` that starts a character.
 */
function characterStart(chunk, offset) {
  let start = offset
  while (start < chunk.length && (chunk[start] & 0xc0) === 0x80) start += 1
  return start
}
