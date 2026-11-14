import { BODY_TIMEOUT_MS, MAX_BODY_BYTES } from './constants.js'

/**
 * Create one HTTP-shaped error.
 * @param status - response status.
 * @param message - user-facing reason.
 * @param headers - extra response headers, such as `allow` for a 405.
 * @returns the error.
 */
export function httpError(status, message, headers) {
  const error = new Error(message)
  error.status = status
  if (headers !== undefined) error.headers = headers
  return error
}

/**
 * Read a bounded JSON object from a request body. The read is abandoned when
 * the peer disconnects or the body stops arriving, so one congested client
 * cannot hold a handler open.
 * @param req - Node request.
 * @returns the parsed object; an empty body yields an empty object.
 */
export function readJson(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = []
    let size = 0
    let settled = false

    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('close', onClose)
      if (error === null) resolveBody(value)
      else rejectBody(error)
    }
    const drain = () => {
      if (!req.destroyed) req.resume()
    }
    const timer = setTimeout(() => {
      finish(httpError(408, 'request body timed out'))
      req.destroy()
    }, BODY_TIMEOUT_MS)
    timer.unref()

    const onData = (chunk) => {
      size += chunk.length
      if (size <= MAX_BODY_BYTES) {
        chunks.push(chunk)
        return
      }
      chunks.length = 0
      finish(httpError(413, 'request body is too large'))
      drain()
    }
    const onEnd = () => {
      if (chunks.length === 0) {
        finish(null, {})
        return
      }
      let parsed
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        finish(httpError(400, 'request body is not valid JSON'))
        return
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        finish(httpError(400, 'request body must be a JSON object'))
        return
      }
      finish(null, parsed)
    }
    const onClose = () => finish(httpError(400, 'request aborted'))
    const onError = () => finish(httpError(400, 'request aborted'))

    const declared = Number(req.headers?.['content-length'])
    if (declared > MAX_BODY_BYTES) {
      finish(httpError(413, 'request body is too large'))
      drain()
      return
    }
    if (req.destroyed) {
      finish(httpError(400, 'request aborted'))
      return
    }
    if (req.readableEnded) {
      finish(null, {})
      return
    }
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('close', onClose)
    // Kept attached after settlement: a destroy during timeout may emit an
    // error after the read has already been answered.
    req.on('error', onError)
  })
}

/**
 * Write one JSON response.
 * @param res - Node response.
 * @param status - HTTP status.
 * @param body - JSON-serializable payload.
 * @param headers - extra response headers.
 */
export function sendJson(res, status, body, headers) {
  if (res.writableEnded || res.destroyed) return
  if (!res.headersSent) {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.setHeader('x-content-type-options', 'nosniff')
    for (const [name, value] of Object.entries(headers ?? {})) res.setHeader(name, value)
  }
  res.end(JSON.stringify(body))
}
