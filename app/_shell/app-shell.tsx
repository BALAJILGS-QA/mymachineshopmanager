'use client'

// Next.js port of src/components/layout/AppShell.tsx (the authenticated portal
// shell). Markup, classes and behaviour preserved 1:1; the ONLY changes are
// navigation: TanStack `Link`(to/activeProps/activeOptions) + `useLocation` →
// next/link `Link`(href) + `usePathname()` with active state computed inline.
// nav.ts (data + moduleGroupForPath) and all hooks are reused from src.

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronRight,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  NAV_ITEMS,
  NAV_GROUPS,
  MOBILE_PRIMARY,
  moduleGroupForPath,
  type NavGroup,
} from '@/components/layout/nav'
import { useAuth } from '@/features/auth/auth'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { useUsers } from '@/features/approvals/hooks/useUsers'
import { DEFAULT_SETTINGS } from '@/data/seed'
import { applyAppSeo, applyFavicon } from '@/lib/seo'

const NAV_BASE =
  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
const NAV_ACTIVE =
  'bg-brand-50 text-brand-800 font-semibold before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-brand-600'
const NAV_INACTIVE = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'

// Active-link matching mirrors the TanStack config: the Dashboard (/app) matches
// exactly; every other portal link matches its path prefix.
function isLinkActive(pathname: string, to: string): boolean {
  if (to === '/app') return pathname === '/app'
  return pathname === to || pathname.startsWith(`${to}/`)
}

function PendingPill({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-2xs font-bold text-white">
      {count}
    </span>
  )
}

function SidebarLinks({
  groups,
  pendingCount,
  activeGroupTitle,
  pathname,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[]
  pendingCount: number
  activeGroupTitle?: string
  pathname: string
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <nav className={clsx('flex-1 space-y-0.5 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
      {groups.map((group) => {
        // Titled groups collapse to a single top-level link to their hub page.
        if (group.title) {
          const GroupIcon = group.items[0]?.icon
          const active = group.title === activeGroupTitle
          return (
            <Link
              key={group.title}
              href={group.to as string}
              onClick={onNavigate}
              title={collapsed ? group.title : undefined}
              className={clsx(
                NAV_BASE,
                active ? NAV_ACTIVE : NAV_INACTIVE,
                collapsed && 'justify-center',
              )}
            >
              {GroupIcon && <GroupIcon size={18} className="shrink-0" />}
              {!collapsed && <span className="flex-1 truncate">{group.title}</span>}
            </Link>
          )
        }
        // Untitled groups (Dashboard, Sales) stay as standalone links.
        return group.items.map((item) => {
          const to = item.to as string
          const active = isLinkActive(pathname, to)
          return (
            <Link
              key={to}
              href={to}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={clsx(
                NAV_BASE,
                collapsed && 'justify-center',
                active ? NAV_ACTIVE : NAV_INACTIVE,
              )}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {!collapsed && to === '/app/approvals' && pendingCount > 0 && (
                <PendingPill count={pendingCount} />
              )}
            </Link>
          )
        })
      })}
    </nav>
  )
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const { data: settings } = useSettings()
  const company = settings?.company ?? DEFAULT_SETTINGS.company
  const logoSrc = company.logoUrl || '/sbi-logo.svg'
  return (
    <div
      className={clsx(
        'flex items-center gap-2.5 border-b border-slate-100 py-4',
        collapsed ? 'justify-center px-2' : 'px-4',
      )}
    >
      <img
        src={logoSrc}
        alt={`${company.name} logo`}
        title={collapsed ? company.name : undefined}
        className="h-[36px] w-[36px] shrink-0 rounded-[26%] object-contain ring-1 ring-slate-200"
      />
      {!collapsed && (
        <p className="truncate text-sm font-bold leading-tight text-slate-900">{company.name}</p>
      )}
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
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('sbi.sidebarCollapsed') === '1',
  )
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c
      if (typeof window !== 'undefined')
        localStorage.setItem('sbi.sidebarCollapsed', next ? '1' : '0')
      return next
    })
  const ml = collapsed ? 'lg:ml-16' : 'lg:ml-60'
  const pathname = usePathname() ?? '/app'

  const navItems = NAV_ITEMS.filter((n) => !n.superAdmin || isSuperAdmin)
  const navGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => !n.superAdmin || isSuperAdmin),
  })).filter((g) => g.items.length > 0)

  const currentLabel =
    navItems.find((n) =>
      n.to === '/app' ? pathname === '/app' : pathname.startsWith((n.to as string) ?? ''),
    )?.label ?? 'Portal'

  const activeGroup = moduleGroupForPath(pathname)
  const tabItems = (activeGroup?.items ?? []).filter((n) => !n.superAdmin || isSuperAdmin)

  useEffect(() => {
    applyAppSeo({
      shopName: company.name,
      pageLabel: currentLabel,
      description: company.seoDescription,
      keywords: company.seoKeywords,
    })
  }, [currentLabel, company.name, company.seoDescription, company.seoKeywords])

  useEffect(() => {
    applyFavicon(company.faviconUrl || '')
  }, [company.faviconUrl])

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <Brand collapsed={collapsed} />
        <SidebarLinks
          groups={navGroups}
          pendingCount={pendingCount}
          activeGroupTitle={activeGroup?.title}
          pathname={pathname}
          collapsed={collapsed}
        />
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} className="mx-auto shrink-0" />
          ) : (
            <>
              <PanelLeftClose size={18} className="shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
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
              activeGroupTitle={activeGroup?.title}
              pathname={pathname}
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

      {/* Top bar */}
      <header
        className={clsx(
          'sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur lg:px-8',
          ml,
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            {activeGroup?.title && (
              <>
                <span className="hidden truncate text-slate-500 sm:inline">
                  {activeGroup.title}
                </span>
                <ChevronRight size={15} className="hidden shrink-0 text-slate-300 sm:inline" />
              </>
            )}
            <span className="truncate font-semibold text-slate-900">{currentLabel}</span>
          </nav>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-xs font-semibold text-slate-900">{session?.username}</p>
            <p className="text-2xs text-slate-500">
              {session?.role === 'SuperAdmin' ? 'Super Admin' : 'User'}
            </p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 ring-1 ring-brand-200">
            {session?.username?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <button onClick={logout} className="btn-secondary btn-sm" title="Sign out">
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* In-module tabs */}
      {activeGroup && tabItems.length > 0 && (
        <div className={clsx('border-b border-slate-200 bg-white', ml)}>
          <nav className="flex gap-1 overflow-x-auto px-4 lg:px-8" aria-label={activeGroup.title}>
            {tabItems.map((item) => {
              const to = item.to as string
              const active = isLinkActive(pathname, to)
              return (
                <Link
                  key={to}
                  href={to}
                  className={clsx(
                    '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
                  )}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                  {to === '/app/approvals' && pendingCount > 0 && (
                    <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-2xs font-bold text-white">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>
      )}

      {/* Main content */}
      <main className={clsx('px-4 pb-24 pt-4 lg:px-8 lg:pb-10', ml)}>
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-slate-300 bg-white lg:hidden">
        {NAV_ITEMS.filter((n) => MOBILE_PRIMARY.includes((n.to as string) ?? '')).map((item) => {
          const to = item.to as string
          const active = isLinkActive(pathname, to)
          return (
            <Link
              key={to}
              href={to}
              className={clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs font-medium',
                active ? 'text-brand-700' : 'text-slate-600',
              )}
            >
              <item.icon size={20} />
              {item.short}
            </Link>
          )
        })}
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
                .filter((n) => !MOBILE_PRIMARY.includes((n.to as string) ?? ''))
                .map((item) => {
                  const to = item.to as string
                  return (
                    <Link
                      key={to}
                      href={to}
                      onClick={() => setMoreOpen(false)}
                      className="flex flex-col items-center gap-1 rounded-xl bg-slate-100 py-3 text-2xs font-semibold text-slate-800 ring-1 ring-slate-200"
                    >
                      <item.icon size={20} />
                      {item.short}
                    </Link>
                  )
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
