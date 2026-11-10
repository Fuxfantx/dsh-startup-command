import { MAX_BODY_BYTES } from './constants.js'

/**
 * Create one HTTP-shaped error.
 * @param status - response status.
 * @param message - user-facing reason.
 * @returns the error.
 */
export function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

/**
 * Read a bounded JSON object from a request.
 * @param req - Node request.
 * @returns the parsed object, or an empty object for an empty body.
 */
export function readJson(req) {
  return new Promise((resolveBody, rejectBody) => {
    let settled = false
    let size = 0
    const chunks = []
    const fail = (error) => {
      if (settled) return
      settled = true
      rejectBody(error)
    }
    const onData = (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0
        fail(httpError(413, 'request body is too large'))
        req.resume()
        return
      }
      chunks.push(chunk)
    }
    const onEnd = () => {
      if (settled) return
      settled = true
      if (chunks.length === 0) {
        resolveBody({})
        return
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          rejectBody(httpError(400, 'request body must be a JSON object'))
          return
        }
        resolveBody(parsed)
      } catch {
        rejectBody(httpError(400, 'request body is not valid JSON'))
      }
    }
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', fail)
    req.on('aborted', () => fail(httpError(400, 'request aborted')))
    req.on('close', () => {
      if (req.complete === false) fail(httpError(400, 'request aborted'))
    })
    const declared = Number(req.headers?.['content-length'])
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      fail(httpError(413, 'request body is too large'))
      req.resume()
    }
  })
}

/**
 * Write one JSON response.
 * @param res - Node response.
 * @param status - HTTP status.
 * @param body - JSON-serializable payload.
 * @param headers - extra response headers.
 */
export function sendJson(res, status, body, headers = {}) {
  if (res.writableEnded || res.destroyed) return
  try {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.setHeader('x-content-type-options', 'nosniff')
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value)
    res.end(JSON.stringify(body))
  } catch {
    try {
      res.destroy()
    } catch {
      // The connection is already gone.
    }
  }
}

/**
 * @param status - HTTP status.
 * @returns the stable client-facing error code.
 */
export function errorCode(status) {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 405) return 'method-error'
  if (status === 413) return 'payload-too-large'
  if (status === 415) return 'unsupported-media-type'
  if (status === 503) return 'unavailable'
  return status >= 500 ? 'internal' : 'request-error'
}
