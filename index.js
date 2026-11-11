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
import { httpError, readJson, sendJson } from './lib/http.js'

/** Services that must exist before commands can be launched and served. */
export const inject = ['subprocess', 'webServer', 'connection']

/** API methods and the controller call each one forwards to. */
const ROUTES = {
  state: (controller, payload) => controller.state(payload),
  save: (controller, payload) => controller.save(payload),
  remove: (controller, payload) => controller.remove(payload),
  select: (controller, payload) => controller.select(payload),
  toggle: (controller, payload) => controller.toggle(payload),
  move: (controller, payload) => controller.move(payload),
  restart: (controller) => controller.restart(),
  stop: (controller) => controller.stop(),
  clear: (controller) => controller.clear(),
}

/**
 * Obtain a logger without depending on one Cordis logger shape.
 * @param ctx - plugin context.
 * @returns the scoped logger, the context logger, or the console.
 */
function loggerFor(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger(SCOPE) : ctx.logger
  return typeof logger?.warn === 'function' ? logger : console
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

  let queue = Promise.resolve()
  const enqueue = (operation) => {
    const result = queue.then(operation, operation)
    queue = result.then(() => undefined, () => undefined)
    return result
  }
  const mutate = (operation) => {
    return controller.closing
      ? Promise.reject(httpError(503, 'the plugin is shutting down'))
      : enqueue(operation)
  }

  // Registered before the first await: a reinstall can dispose this instance
  // while the store is still loading, and nothing may start after that.
  ctx.effect(() => () => {
    controller.beginClose()
    return enqueue(() => controller.dispose())
  }, `${SCOPE}: lifecycle`)

  await controller.load()
  if (controller.closing) return

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      try {
        const rejection = ctx.connection.requestRejection(req)
        if (rejection !== undefined) {
          throw httpError(rejection, rejection === 401 ? 'unauthorized' : 'forbidden')
        }
        if (req.method !== 'POST') throw httpError(405, 'POST only', { allow: 'POST' })
        const path = (req.url ?? '').split('?', 1)[0]
        const method = path.startsWith(`${API_PREFIX}/`) ? path.slice(API_PREFIX.length + 1) : ''
        if (!Object.hasOwn(ROUTES, method)) throw httpError(404, `Unknown method "${method}"`)
        const mediaType = String(req.headers?.['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
        if (mediaType !== 'application/json') throw httpError(415, 'content-type must be application/json')
        const payload = await readJson(req)
        const route = ROUTES[method]
        // Only `state` is read-only; every other method starts, stops, or
        // persists, so it shares the serial mutation queue.
        const value = method === 'state'
          ? route(controller, payload)
          : await mutate(() => route(controller, payload))
        sendJson(res, 200, { ok: true, value })
      } catch (error) {
        const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
          ? error.status
          : 500
        // 503 means a mutation arrived while the plugin is being unloaded; that
        // is expected and not worth a log line.
        if (status >= 500 && status !== 503) {
          logger.warn(`[${SCOPE}] API ${req.method ?? 'request'} failed: ${String(error)}`)
        }
        if (!req.readableEnded) req.resume()
        sendJson(res, status, {
          ok: false,
          error: { message: error instanceof Error ? error.message : String(error) },
        }, error?.headers)
      }
    },
  }), `${SCOPE}: api route`)

  void enqueue(() => controller.startEnabled()).catch((error) => {
    logger.error(`[${SCOPE}] cannot start the enabled presets: ${String(error)}`)
  })
}

export { StartupController }
