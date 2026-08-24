import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Cog, LogOut, Menu, MoreHorizontal, X } from 'lucide-react'
import { clsx } from 'clsx'
import { NAV_ITEMS, MOBILE_PRIMARY } from './nav'
import { useAuth } from '@/features/auth/auth'
import type { ReactNode } from 'react'

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/app'}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          <item.icon size={18} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Cog size={20} />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold text-slate-900">CNC Shop</p>
        <p className="text-2xs text-slate-400">Management System</p>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <Brand />
        <SidebarLinks />
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <div className="leading-tight">
              <p className="text-xs font-semibold text-slate-700">{session?.username}</p>
              <p className="text-2xs text-slate-400">{session?.role}</p>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                className="mr-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <SidebarLinks onNavigate={() => setDrawerOpen(false)} />
            <div className="border-t border-slate-100 p-3">
              <button onClick={logout} className="btn-secondary w-full">
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Top bar (mobile/tablet) */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <button
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <span className="text-sm font-semibold text-slate-800">
          {NAV_ITEMS.find((n) =>
            n.to === '/app' ? location.pathname === '/app' : location.pathname.startsWith(n.to),
          )?.label ?? 'CNC Shop'}
        </span>
        <div className="h-8 w-8 rounded-full bg-brand-100 text-center text-sm font-semibold leading-8 text-brand-700">
          {session?.username?.[0]?.toUpperCase() ?? 'A'}
        </div>
      </header>

      {/* Main content */}
      <main className="px-4 pb-24 pt-4 lg:ml-60 lg:px-8 lg:pb-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-slate-200 bg-white lg:hidden">
        {NAV_ITEMS.filter((n) => MOBILE_PRIMARY.includes(n.to)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/app'}
            className={({ isActive }) =>
              clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs font-medium',
                isActive ? 'text-brand-600' : 'text-slate-500',
              )
            }
          >
            <item.icon size={20} />
            {item.short}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs font-medium text-slate-500"
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
              {NAV_ITEMS.filter((n) => !MOBILE_PRIMARY.includes(n.to)).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 py-3 text-2xs font-medium text-slate-600"
                >
                  <item.icon size={20} />
                  {item.short}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
