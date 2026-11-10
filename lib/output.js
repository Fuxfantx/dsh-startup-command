/**
 * Bounded UTF-8 tail buffer.
 *
 * Chunks are retained as encoded buffers so trimming a chatty process costs
 * only the dropped bytes; the joined string is cached until the next append.
 */
export class OutputBuffer {
  #chunks = []
  #head = 0
  #headOffset = 0
  #bytes = 0
  #limit
  #text = ''
  #dirty = false
  #truncated = false

  /** @param limit - maximum retained bytes. */
  constructor(limit) {
    this.#limit = Math.max(1, Math.trunc(limit))
  }

  /** Retained bytes. */
  get bytes() {
    return this.#bytes
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
    this.#dirty = true
    if (this.#bytes > this.#limit) this.#trim()
    if (this.#chunks.length - this.#head > 512) this.#coalesce()
    return true
  }

  /** Discard all retained output. */
  clear() {
    this.#chunks = []
    this.#head = 0
    this.#headOffset = 0
    this.#bytes = 0
    this.#text = ''
    this.#dirty = false
    this.#truncated = false
  }

  /** @returns the retained text. */
  toString() {
    if (!this.#dirty) return this.#text
    const live = this.#chunks.slice(this.#head)
    if (live.length === 0) {
      this.#text = ''
    } else {
      if (this.#headOffset > 0) live[0] = live[0].subarray(this.#headOffset)
      this.#text = Buffer.concat(live).toString('utf8')
    }
    this.#dirty = false
    return this.#text
  }

  /** Drop the oldest bytes, keeping UTF-8 boundaries intact. */
  #trim() {
    let excess = this.#bytes - this.#limit
    this.#truncated = true
    while (excess > 0) {
      const first = this.#chunks[this.#head]
      if (first === undefined) {
        this.#bytes = 0
        this.#headOffset = 0
        break
      }
      const available = first.length - this.#headOffset
      if (available <= excess) {
        this.#head += 1
        this.#headOffset = 0
        this.#bytes -= available
        excess -= available
        continue
      }
      let start = this.#headOffset + excess
      while (start < first.length && (first[start] & 0xc0) === 0x80) start += 1
      if (start >= first.length) {
        this.#head += 1
        this.#headOffset = 0
        this.#bytes -= available
        excess = 0
        continue
      }
      this.#bytes -= start - this.#headOffset
      this.#headOffset = start
      excess = 0
    }
    this.#compact()
  }

  /** Fold many small chunks into one buffer to bound object overhead. */
  #coalesce() {
    const live = this.#chunks.slice(this.#head)
    if (live.length <= 1) return
    if (this.#headOffset > 0) live[0] = live[0].subarray(this.#headOffset)
    this.#chunks = [Buffer.concat(live)]
    this.#head = 0
    this.#headOffset = 0
  }

  /** Release dropped chunk references and avoid an ever-growing head index. */
  #compact() {
    if (this.#head === this.#chunks.length) {
      this.#chunks = []
      this.#head = 0
      this.#headOffset = 0
      return
    }
    if (this.#head > 32 && this.#head * 2 >= this.#chunks.length) {
      this.#chunks = this.#chunks.slice(this.#head)
      this.#head = 0
    }
  }
}
