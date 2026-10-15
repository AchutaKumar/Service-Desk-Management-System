import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Ticket, Bell, Users, FolderTree, Building2, GaugeCircle,
  BarChart3, LifeBuoy, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NAV_SECTIONS = (isAdmin, isAgent) => [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Tickets',
    items: [
      { to: '/tickets', label: isAgent ? 'Ticket queue' : 'My tickets', icon: Ticket },
      { to: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  ...(isAdmin
    ? [
        {
          label: 'Administration',
          items: [
            { to: '/users', label: 'Users', icon: Users },
            { to: '/categories', label: 'Categories', icon: FolderTree },
            { to: '/departments', label: 'Departments', icon: Building2 },
            { to: '/priorities', label: 'Priorities & SLA', icon: GaugeCircle },
          ],
        },
        {
          label: 'Insights',
          items: [{ to: '/reports', label: 'Reports', icon: BarChart3 }],
        },
      ]
    : []),
];

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isAgent = user?.role === 'SUPPORT_AGENT';
  const sections = NAV_SECTIONS(isAdmin, isAgent);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-900 text-brand-100 transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between gap-3 border-b border-white/10 px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <LifeBuoy className="size-4.5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">ServiceDesk</p>
              <p className="text-[11px] text-brand-300">IT Service Requests</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-1 text-brand-300 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 scroll-quiet">
          {sections.map((section) => (
            <div key={section.label} className="mb-5">
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-brand-400 uppercase">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onCloseMobile}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-white/10 text-white'
                            : 'text-brand-200 hover:bg-white/5 hover:text-white'
                        }`
                      }
                    >
                      <item.icon className="size-4.5 shrink-0" aria-hidden="true" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer hint */}
        <div className="border-t border-white/10 px-5 py-3">
          <p className="text-[11px] leading-relaxed text-brand-300">
            Support hours 9:00–18:00 · Critical issues are auto-routed to on-call agents.
          </p>
        </div>
      </aside>
    </>
  );
}
