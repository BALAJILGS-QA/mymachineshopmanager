// Central logging abstraction. The ONLY place in `src/` allowed to call
// console.* (enforced by ESLint). debug/info are silenced in production builds
// so the browser console stays clean; warn/error always surface. This is also
// the seam where an external sink (e.g. Sentry) is wired in later.

const isDev = import.meta.env.DEV

type Meta = unknown[]

export const logger = {
  debug(message: string, ...meta: Meta): void {
    if (isDev) console.debug(`[msm] ${message}`, ...meta)
  },
  info(message: string, ...meta: Meta): void {
    if (isDev) console.info(`[msm] ${message}`, ...meta)
  },
  warn(message: string, ...meta: Meta): void {
    console.warn(`[msm] ${message}`, ...meta)
  },
  error(message: string, error?: unknown, ...meta: Meta): void {
    console.error(`[msm] ${message}`, error, ...meta)
    // Future: forward to Sentry / remote error tracking here.
  },
}
