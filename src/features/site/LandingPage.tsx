import { Link } from 'react-router-dom'
import { ArrowUpRight, Boxes, Gauge, ShieldCheck } from 'lucide-react'
import { SiteLayout } from './SiteLayout'
import { useSeo, SITE } from '@/lib/seo'

export function LandingPage() {
  useSeo({
    path: '/',
    title: 'Sree Balaji Industries — Precision CNC Machining & Turning',
    description:
      'Precision CNC turning and milling for pumps, engineering and industrial components. Company-wise job tracking, tight tolerances and full traceability. Sign in to the client portal.',
    type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Sree Balaji Industries',
      description:
        'Precision CNC machining, turning and milling services for pumps, engineering and industrial components.',
      url: SITE.BASE_URL,
      image: SITE.DEFAULT_IMAGE,
      email: 'contact@sreebalajiindustries.com',
      priceRange: '₹₹',
      areaServed: 'IN',
    },
  })

  return (
    <SiteLayout showFooter={false}>
      <Hero />
    </SiteLayout>
  )
}

function Hero() {
  return (
    <section className="blueprint relative overflow-hidden">
      <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[560px]" />
      <div className="mx-auto grid min-h-[calc(100vh-64px)] max-w-6xl items-center gap-10 px-5 py-20 md:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="kicker rise d1">Precision CNC Machining · Since 2016</p>
          <h1 className="display rise d2 mt-4 text-4xl font-bold leading-[1.02] sm:text-5xl md:text-6xl">
            Metal, machined to
            <span className="text-[var(--amber)]"> exact tolerance.</span>
          </h1>
          <p className="rise d3 mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-dim)]">
            Sree Balaji Industries delivers CNC turning and milling for pumps, engineering and
            industrial components — with company-wise job tracking from raw material to dispatch.
          </p>

          <div className="rise d4 mt-8 flex flex-wrap items-center gap-3">
            <Link to="/signup" className="site-btn site-btn-primary">
              Create Account <ArrowUpRight size={16} />
            </Link>
            <Link to="/login" className="site-btn site-btn-ghost">
              Sign In
            </Link>
          </div>

          <div className="rise d5 mt-10 flex flex-wrap gap-x-8 gap-y-3">
            {[
              { icon: Gauge, t: 'Tight tolerances' },
              { icon: ShieldCheck, t: 'Documented QC' },
              { icon: Boxes, t: 'Batch traceability' },
            ].map((f) => (
              <span key={f.t} className="flex items-center gap-2 text-sm text-[var(--ink-dim)]">
                <f.icon size={16} className="text-[var(--amber)]" /> {f.t}
              </span>
            ))}
          </div>
        </div>

        <div className="rise d3 relative mx-auto hidden aspect-square w-full max-w-sm md:block">
          <TechDial />
        </div>
      </div>
    </section>
  )
}

// Decorative precision dial / schematic.
function TechDial() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label="Precision machining schematic">
      <defs>
        <radialGradient id="g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#182230" />
          <stop offset="100%" stopColor="#0b0f15" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="190" fill="url(#g)" stroke="#232c38" />
      <g className="spin-slow" style={{ transformOrigin: '200px 200px' }}>
        <circle cx="200" cy="200" r="150" fill="none" stroke="#2b3646" strokeDasharray="2 10" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2
          return (
            <line
              key={i}
              x1={200 + Math.cos(a) * 158}
              y1={200 + Math.sin(a) * 158}
              x2={200 + Math.cos(a) * 172}
              y2={200 + Math.sin(a) * 172}
              stroke="#3a4657"
              strokeWidth="2"
            />
          )
        })}
      </g>
      <circle cx="200" cy="200" r="110" fill="none" stroke="#ff7a1a" strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="70" fill="none" stroke="#4cc4f0" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="30" y1="200" x2="370" y2="200" stroke="#ff7a1a" strokeOpacity="0.35" strokeWidth="1" />
      <line x1="200" y1="30" x2="200" y2="370" stroke="#ff7a1a" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="200" cy="200" r="14" fill="#ff7a1a" />
      <text x="200" y="300" textAnchor="middle" fill="#5f6b7c" fontFamily="monospace" fontSize="12">
        ⌀ 200.00 ±0.01
      </text>
    </svg>
  )
}
