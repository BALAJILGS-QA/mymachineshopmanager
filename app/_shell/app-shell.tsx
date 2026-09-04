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
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  NAV_ITEMS,
  NAV_GROUPS,
  MOBILE_PRIMARY,
  moduleGroupForPath,
  type NavGroup,
  type MenuAccent,
} from '@/components/layout/nav'
import { useAuth } from '@/features/auth/auth'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { useUsers } from '@/features/approvals/hooks/useUsers'
import { DEFAULT_SETTINGS } from '@/data/seed'
import { applyAppSeo, applyFavicon } from '@/lib/app-seo'

// Charcoal rail styling (MSM rebrand). Active item: solid industrial orange
// (#fb923c = brand-400) with bright-white text + icon for unmistakable
// "current page" contrast. Inactive: soft-white text with muted icons on the
// #18181B rail; hover fades in a subtle transparent-orange wash, white text and
// an orange icon. 150ms colour transition.
const NAV_BASE =
  'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150'
const NAV_ACTIVE = 'bg-brand-400 font-semibold text-white'
const NAV_INACTIVE = 'font-medium text-zinc-100 hover:bg-brand-400/[0.12] hover:text-white'

// Per-module inactive icon accent (centralised design tokens — §14). Each token
// pairs a soft 10%-tint chip background with its accent icon colour. The ACTIVE
// state ignores this entirely (unified orange row + white icon), so colour never
// competes with the current-page signal.
const MENU_ACCENT: Record<MenuAccent, string> = {
  blue: 'bg-blue-400/10 text-blue-400',
  orange: 'bg-brand-400/10 text-brand-400',
  emerald: 'bg-emerald-400/10 text-emerald-400',
  violet: 'bg-violet-400/10 text-violet-400',
  amber: 'bg-amber-400/10 text-amber-400',
  cyan: 'bg-cyan-400/10 text-cyan-400',
  slate: 'bg-slate-400/10 text-slate-400',
}

// Main-menu icon in a subtle 32px rounded chip. Inactive = module accent colour;
// active = white icon on a translucent-white chip (reads clearly on the orange
// active row). The accent icon colour is preserved on hover (§6).
function MenuIcon({
  Icon,
  accent,
  active,
  size = 18,
}: {
  Icon: LucideIcon
  accent?: MenuAccent
  active: boolean
  size?: number
}) {
  return (
    <span
      className={clsx(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
        active ? 'bg-white/20 text-white' : MENU_ACCENT[accent ?? 'slate'],
      )}
    >
      <Icon size={size} strokeWidth={1.9} />
    </span>
  )
}

// Submenu (child) item styling — deliberately SUBTLER than the solid-orange
// active parent: muted slate icons + light text, shifting to orange when active
// (soft orange wash + orange text/icon). Kept legible against the connector rail.
const CHILD_BASE =
  'group relative flex items-center gap-2.5 rounded-lg py-1.5 pl-2.5 pr-3 text-sm transition-colors duration-150'
const CHILD_ACTIVE = 'bg-brand-400/[0.10] font-semibold text-brand-400'
const CHILD_INACTIVE = 'font-medium text-zinc-300 hover:bg-white/5 hover:text-white'

function childIconClass(active: boolean): string {
  return clsx('shrink-0', active ? 'text-brand-400' : 'text-slate-400 group-hover:text-brand-400')
}

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
  // Which parent modules are expanded. The module that owns the current route is
  // always kept open (so the active child is visible); users can toggle others.
  // Route drives active state — the open set is only extra user affordance.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(activeGroupTitle ? [activeGroupTitle] : []),
  )
  useEffect(() => {
    if (!activeGroupTitle) return
    setOpen((prev) => (prev.has(activeGroupTitle) ? prev : new Set(prev).add(activeGroupTitle)))
  }, [activeGroupTitle])
  const toggle = (title: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })

  return (
    <nav className={clsx('flex-1 space-y-0.5 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
      {groups.map((group) => {
        // ---- Titled parent module → expandable submenu accordion ----
        if (group.title) {
          const ParentIcon = group.icon ?? group.items[0]?.icon
          const active = group.title === activeGroupTitle
          const groupPending = group.items.some((i) => i.to === '/app/approvals') ? pendingCount : 0

          // Collapsed rail has no room for a submenu: the parent icon links to
          // the module hub (which lists its pages), keeping every page reachable.
          if (collapsed) {
            return (
              <Link
                key={group.title}
                href={group.to as string}
                onClick={onNavigate}
                title={group.title}
                aria-label={group.title}
                className={clsx(NAV_BASE, 'justify-center', active ? NAV_ACTIVE : NAV_INACTIVE)}
              >
                {ParentIcon && <MenuIcon Icon={ParentIcon} accent={group.accent} active={active} />}
                {groupPending > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" />
                )}
              </Link>
            )
          }

          const expanded = open.has(group.title)
          return (
            <div key={group.title}>
              <button
                type="button"
                onClick={() => toggle(group.title as string)}
                aria-expanded={expanded}
                title={group.title}
                className={clsx(NAV_BASE, 'w-full', active ? NAV_ACTIVE : NAV_INACTIVE)}
              >
                {ParentIcon && <MenuIcon Icon={ParentIcon} accent={group.accent} active={active} />}
                <span className="flex-1 truncate text-left">{group.title}</span>
                {groupPending > 0 && !expanded && <PendingPill count={groupPending} />}
                <ChevronDown
                  size={16}
                  aria-hidden
                  className={clsx(
                    'shrink-0 transition-transform duration-150',
                    expanded && 'rotate-180',
                    active ? 'text-white' : 'text-zinc-400 group-hover:text-white',
                  )}
                />
              </button>
              {expanded && (
                <div className="ml-[1.375rem] mt-1 space-y-0.5 border-l border-zinc-700/70 pl-3">
                  {group.items.map((item) => {
                    const to = item.to as string
                    const childActive = isLinkActive(pathname, to)
                    return (
                      <Link
                        key={to}
                        href={to}
                        onClick={onNavigate}
                        aria-current={childActive ? 'page' : undefined}
                        className={clsx(CHILD_BASE, childActive ? CHILD_ACTIVE : CHILD_INACTIVE)}
                      >
                        <item.icon size={16} className={childIconClass(childActive)} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {to === '/app/approvals' && pendingCount > 0 && (
                          <PendingPill count={pendingCount} />
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }
        // ---- Untitled group → standalone top-level link (Dashboard, Sales, CRM) ----
        return group.items.map((item) => {
          const to = item.to as string
          const active = isLinkActive(pathname, to)
          return (
            <Link
              key={to}
              href={to}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                NAV_BASE,
                collapsed && 'justify-center',
                active ? NAV_ACTIVE : NAV_INACTIVE,
              )}
            >
              <MenuIcon Icon={item.icon} accent={group.accent} active={active} />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
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
        'flex items-center gap-2.5 border-b border-charcoal-700 py-4',
        collapsed ? 'justify-center px-2' : 'px-4',
      )}
    >
      <img
        src={logoSrc}
        alt={`${company.name} logo`}
        title={collapsed ? company.name : undefined}
        className="h-[36px] w-[36px] shrink-0 rounded-[26%] bg-white object-contain ring-1 ring-charcoal-600"
      />
      {!collapsed && (
        <p className="truncate text-sm font-bold leading-tight text-white">{company.name}</p>
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

  // The module a route belongs to — drives the breadcrumb parent and the
  // sidebar's active/expanded parent. Sub-module navigation now lives in the
  // sidebar accordion, so the old in-module tab bar has been removed to avoid
  // duplicating navigation (§11).
  const activeGroup = moduleGroupForPath(pathname)

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
      {/* Desktop sidebar — charcoal rail (MSM rebrand) */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-charcoal-800 bg-[#18181B] transition-[width] duration-200 lg:flex',
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
          className="flex items-center gap-2 border-t border-charcoal-700 px-3 py-2.5 text-sm font-medium text-charcoal-400 transition-colors hover:bg-white/5 hover:text-white"
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

      {/* Mobile drawer — charcoal, matching the desktop rail */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-[#18181B] shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                className="mr-3 rounded-md p-1.5 text-charcoal-400 hover:bg-white/5 hover:text-white"
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
            <div className="border-t border-charcoal-700 p-3">
              <button
                onClick={logout}
                className="btn flex w-full items-center justify-center border border-charcoal-600 text-charcoal-100 hover:bg-white/5"
              >
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
