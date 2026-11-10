/**
 * Host half of the startup-command bundle.
 *
 * Owns the preset store, the managed preset processes, and their bounded
 * output buffers. The browser half talks to this file through the same-origin
 * `/startup-command/api` prefix.
 *
 * Commands run through `ctx.subprocess`, whose local provider owns a managed
 * range (a Windows Job object, a Linux scope, or the documented fallback). The
 * provider kills the whole range when the plugin is disposed or the Host exits,
 * so descendants created by a command do not outlive DSH.
 *
 * @module dsh-startup-command
 */

import { StartupController } from './lib/controller.js'
import { API_PREFIX, SCOPE } from './lib/constants.js'
import { errorCode, httpError, readJson, sendJson } from './lib/http.js'

/** Services that must exist before commands can be launched and served. */
export const inject = ['subprocess', 'webServer', 'connection']

/** API methods that change state and therefore share one serial queue. */
const MUTATING = ['save', 'remove', 'select', 'toggle', 'move', 'restart', 'stop', 'clear']

/**
 * Obtain a logger without depending on one Cordis logger shape.
 * @param ctx - plugin context.
 * @returns an object with best-effort info, warn, and error methods.
 */
function loggerFor(ctx) {
  try {
    const scoped = ctx.logger?.(SCOPE)
    if (scoped !== undefined && scoped !== null &&
      typeof scoped.info === 'function' &&
      typeof scoped.warn === 'function' &&
      typeof scoped.error === 'function') {
      return scoped
    }
  } catch {
    // Fall through to the context logger.
  }
  const base = ctx.logger ?? {}
  const call = (name) => (message) => {
    const method = base[name]
    if (typeof method === 'function') method.call(base, message)
  }
  return {
    info: call('info'),
    warn: call('warn'),
    error: call('error'),
  }
}

/**
 * Install the controller, the HTTP API, and the startup run.
 *
 * @param ctx - plugin context.
 * @param config - bundle row configuration.
 */
export async function apply(ctx, config = {}) {
  const logger = loggerFor(ctx)
  const controller = new StartupController(ctx, config, logger)
  await controller.load()

  let closing = false
  let queue = Promise.resolve()
  const enqueue = (operation) => {
    const result = queue.then(operation, operation)
    queue = result.then(() => undefined, () => undefined)
    return result
  }
  const mutate = (operation) => {
    return closing ? Promise.reject(httpError(503, 'plugin is shutting down')) : enqueue(operation)
  }

  const api = {
    state: (payload) => controller.state(payload),
    save: (payload) => controller.save(payload),
    remove: (payload) => controller.remove(payload),
    select: (payload) => controller.select(payload),
    toggle: (payload) => controller.toggle(payload),
    move: (payload) => controller.move(payload),
    restart: () => controller.restart(),
    stop: () => controller.stop(),
    clear: () => controller.clear(),
  }
  for (const method of MUTATING) {
    const operation = api[method]
    api[method] = (payload) => mutate(() => operation(payload))
  }

  ctx.effect(() => () => {
    closing = true
    controller.beginClose()
    return enqueue(() => controller.dispose())
  }, `${SCOPE}: process lifecycle`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      try {
        let rejection
        try {
          rejection = ctx.connection.requestRejection(req)
        } catch {
          rejection = 403
        }
        if (rejection !== undefined) {
          if (!req.readableEnded) req.resume()
          sendJson(res, rejection, {
            ok: false,
            error: { code: errorCode(rejection), message: rejection === 401 ? 'unauthorized' : 'forbidden' },
          })
          return
        }
        if (req.method !== 'POST') {
          if (!req.readableEnded) req.resume()
          sendJson(res, 405, {
            ok: false,
            error: { code: errorCode(405), message: 'POST only' },
          }, { allow: 'POST' })
          return
        }
        let pathname
        try {
          pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
        } catch {
          throw httpError(400, 'invalid request URL')
        }
        const method = pathname.startsWith(`${API_PREFIX}/`)
          ? pathname.slice(API_PREFIX.length + 1)
          : ''
        if (method === '' || method.includes('/') || !Object.hasOwn(api, method)) {
          throw httpError(404, `Unknown method "${method}"`)
        }
        const mediaType = String(req.headers?.['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
        if (mediaType !== 'application/json') {
          req.resume()
          throw httpError(415, 'content-type must be application/json')
        }
        const payload = await readJson(req)
        const value = await api[method](payload)
        sendJson(res, 200, { ok: true, value })
      } catch (error) {
        const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
          ? error.status
          : 500
        if (status >= 500) logger.warn(`[${SCOPE}] API ${req.method ?? 'request'} failed: ${String(error)}`)
        if (!req.readableEnded) req.resume()
        sendJson(res, status, {
          ok: false,
          error: {
            code: errorCode(status),
            message: error instanceof Error ? error.message : String(error),
          },
        })
      }
    },
  }), `${SCOPE}: api route`)

  void enqueue(() => controller.startEnabled()).catch((error) => {
    logger.error(`[${SCOPE}] cannot start the enabled presets: ${String(error)}`)
  })
}

export { StartupController }
