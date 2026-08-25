import { useId } from 'react'
import { clsx } from 'clsx'

// MSM monogram mark — a machined tile: brand-gradient rounded square with a
// precision "turned metal" arc, the MSM wordmark, and an amber tooling edge.
// Pure SVG so it stays crisp at any size (sidebar, login, favicon). The graphic
// carries the MSM initials; page text uses the full "Machine Shop Management".
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  const id = useId()
  const g = `${id}-grad`
  const sheen = `${id}-sheen`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="MSM — Machine Shop Management logo"
      className={className}
    >
      <defs>
        <linearGradient id={g} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a4d13a" />
          <stop offset="0.55" stopColor="#8db600" />
          <stop offset="1" stopColor="#4f6a00" />
        </linearGradient>
        <linearGradient id={sheen} x1="32" y1="4" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* tile */}
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${g})`} />
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${sheen})`} />
      <rect
        x="3.1"
        y="3.1"
        width="57.8"
        height="57.8"
        rx="15.9"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="1.2"
      />

      {/* "turned metal" concentric arcs — precision machining cue */}
      <g fill="none" strokeLinecap="round">
        <path d="M14 20a20 20 0 0 1 36 0" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1.4" />
        <path d="M18 18a15 15 0 0 1 28 0" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.4" />
      </g>

      {/* MSM monogram */}
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fontFamily="Inter, system-ui, Segoe UI, sans-serif"
        fontWeight="800"
        fontSize="20.5"
        letterSpacing="-0.6"
        fill="#ffffff"
      >
        MSM
      </text>

      {/* amber tooling edge */}
      <rect x="21" y="46.5" width="22" height="3" rx="1.5" fill="#f4b400" />
    </svg>
  )
}

// Full lockup: mark + name (+ optional tagline). Used on the login surface and
// in the app shell. `name` is dynamic inside the app (shop name from settings).
export function BrandLockup({
  name,
  tagline,
  size = 38,
  className,
  nameClassName,
}: {
  name: string
  tagline?: string
  size?: number
  className?: string
  nameClassName?: string
}) {
  return (
    <span className={clsx('flex items-center gap-2.5', className)}>
      <Logo size={size} className="shrink-0 rounded-[28%] shadow-sm" />
      <span className="leading-tight">
        <span className={clsx('block font-bold tracking-tight text-slate-900', nameClassName)}>
          {name}
        </span>
        {tagline && (
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-700">
            {tagline}
          </span>
        )}
      </span>
    </span>
  )
}
