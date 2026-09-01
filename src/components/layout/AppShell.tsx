import { useEffect, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { LogOut, Menu, MoreHorizontal, X } from 'lucide-react'
import { NAV_ITEMS, NAV_GROUPS, MOBILE_PRIMARY, type NavGroup } from './nav'
import { useAuth } from '@/features/auth/auth'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { useUsers } from '@/features/approvals/hooks/useUsers'
import { DEFAULT_SETTINGS } from '@/data/seed'
import { applyAppSeo, applyFavicon } from '@/lib/seo'
import type { ReactNode } from 'react'

function SidebarLinks({
  groups,
  pendingCount,
  onNavigate,
}: {
  groups: NavGroup[]
  pendingCount: number
  onNavigate?: () => void
}) {
  return (
    <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-3">
      {groups.map((group, gi) => (
        <div key={group.title ?? `group-${gi}`} className="space-y-0.5">
          {group.title &&
            (group.to ? (
              // Clickable header → the group's hub page (buttons for each item).
              <Link
                to={group.to}
                onClick={onNavigate}
                className="flex items-center px-3 pb-0.5 pt-1 text-2xs font-semibold uppercase tracking-wider text-slate-400 transition hover:text-brand-600"
                activeProps={{ className: 'text-brand-600' }}
              >
                {group.title}
              </Link>
            ) : (
              <p className="px-3 pb-0.5 pt-1 text-2xs font-semibold uppercase tracking-wider text-slate-400">
                {group.title}
              </p>
            ))}
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === '/app' }}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition"
              activeProps={{
                className: 'bg-brand-gradient text-white shadow-sm shadow-brand-700/30',
              }}
              inactiveProps={{ className: 'text-slate-700 hover:bg-brand-50 hover:text-brand-800' }}
            >
              <item.icon size={18} />
              <span className="flex-1">{item.label}</span>
              {item.to === '/app/approvals' && pendingCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-2xs font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

function Brand() {
  // Brand reflects the configured shop profile so a rename in Settings shows
  // everywhere the shell renders (sidebar + mobile drawer).
  const { data: settings } = useSettings()
  const company = settings?.company ?? DEFAULT_SETTINGS.company
  // Uploaded logo when set, otherwise the bundled Sree Balaji mark.
  const logoSrc = company.logoUrl || '/sbi-logo.svg'
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <img
        src={logoSrc}
        alt={`${company.name} logo`}
        className="h-[38px] w-[38px] shrink-0 rounded-[28%] object-contain shadow-sm"
      />
      {/* Only the configured shop-profile name — no product tagline. */}
      <p className="text-sm font-bold leading-tight text-slate-900">{company.name}</p>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, logout, isSuperAdmin } = useAuth()
  const { data: settings } = useSettings()
  const company = settings?.company ?? DEFAULT_SETTINGS.company
  const { data: users = [] } = useUsers()
  const pendingCount = users.filter((u) => u.status === 'pending').length
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  // Super-admin-only items (e.g. User Approvals) are hidden for regular users.
  const navItems = NAV_ITEMS.filter((n) => !n.superAdmin || isSuperAdmin)
  // Same filter applied per group, dropping any group left empty.
  const navGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => !n.superAdmin || isSuperAdmin),
  })).filter((g) => g.items.length > 0)

  const currentLabel =
    navItems.find((n) =>
      n.to === '/app' ? location.pathname === '/app' : location.pathname.startsWith(n.to ?? ''),
    )?.label ?? 'Portal'

  // Apply the configured shop profile as global SEO/title on every route, so a
  // change in Settings → Shop Profile reflects across all app pages.
  useEffect(() => {
    applyAppSeo({
      shopName: company.name,
      pageLabel: currentLabel,
      description: company.seoDescription,
      keywords: company.seoKeywords,
    })
  }, [currentLabel, company.name, company.seoDescription, company.seoKeywords])

  // Apply the shop's uploaded favicon (falls back to the bundled default).
  useEffect(() => {
    applyFavicon(company.faviconUrl || '')
  }, [company.faviconUrl])

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-gradient-to-b from-white to-brand-50/50 lg:flex">
        <Brand />
        <SidebarLinks groups={navGroups} pendingCount={pendingCount} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                className="mr-3 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <SidebarLinks
              groups={navGroups}
              pendingCount={pendingCount}
              onNavigate={() => setDrawerOpen(false)}
            />
            <div className="border-t border-slate-100 p-3">
              <button onClick={logout} className="btn-secondary w-full">
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Top bar — visible on all sizes; logout sits at the right end */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-300 bg-white/90 px-4 py-2.5 backdrop-blur lg:ml-60 lg:px-8">
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-xs font-semibold text-slate-900">{session?.username}</p>
            <p className="text-2xs text-slate-600">
              {session?.role === 'SuperAdmin' ? 'Super Admin' : 'User'}
            </p>
          </div>
          <div className="h-8 w-8 rounded-full bg-brand-100 text-center text-sm font-bold leading-8 text-brand-800 ring-1 ring-brand-300">
            {session?.username?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <button onClick={logout} className="btn-secondary btn-sm" title="Sign out">
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="px-4 pb-24 pt-4 lg:ml-60 lg:px-8 lg:pb-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-slate-300 bg-white lg:hidden">
        {NAV_ITEMS.filter((n) => MOBILE_PRIMARY.includes(n.to ?? '')).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === '/app' }}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs font-medium"
            activeProps={{ className: 'text-brand-700' }}
            inactiveProps={{ className: 'text-slate-600' }}
          >
            <item.icon size={20} />
            {item.short}
          </Link>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs font-medium text-slate-600"
        >
          <MoreHorizontal size={20} />
          More
        </button>
      </nav>

      {/* "More" sheet for remaining nav on mobile */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-3">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200" />
            <div className="grid grid-cols-3 gap-2">
              {navItems
                .filter((n) => !MOBILE_PRIMARY.includes(n.to ?? ''))
                .map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1 rounded-xl bg-slate-100 py-3 text-2xs font-semibold text-slate-800 ring-1 ring-slate-200"
                  >
                    <item.icon size={20} />
                    {item.short}
                  </Link>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
