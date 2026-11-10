/** Shared Host-side names, limits, and lifecycle timings. */
export const SCOPE = 'startup-command'
export const API_PREFIX = '/startup-command/api'
export const STORE_FILE = 'startup-command-presets.json'
export const STORE_VERSION = 1

/** Persisted text bounds. */
export const MAX_NAME = 80
export const MAX_ID = 64
export const MAX_COMMAND = 20000
export const MAX_CWD = 500
export const MAX_INTERPRETER = 200
export const MAX_PRESETS = 100
export const MAX_STORE_BYTES = 4 * 1024 * 1024

/** Live output and request-body bounds. */
export const MAX_OUTPUT_BYTES = 256 * 1024
export const MAX_BODY_BYTES = 1000 * 1000

/** Delay between launching two enabled presets. */
export const START_INTERVAL_MS = 500

/** Default and hard-upper lifecycle timings. */
export const DEFAULT_GRACE_MS = 3000
export const DEFAULT_CLEANUP_MS = 10000
export const MAX_GRACE_MS = 60000
export const MAX_CLEANUP_MS = 300000
