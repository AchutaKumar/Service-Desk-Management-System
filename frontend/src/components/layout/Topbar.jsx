import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, UserRound, ChevronDown, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { notificationsApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { Avatar } from '../ui/Chips';
import { relativeTime } from '../../utils/format';

export default function Topbar({ onOpenMobileNav }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const notifRef = useRef(null);
  const menuRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    try {
      const { data } = await notificationsApi.list();
      setNotifications(data.data.notifications || []);
      setUnreadCount(data.data.unread_count || 0);
    } catch {
      // Bell is non-critical; fail silently
    }
  }, []);

  // Initial load + poll every 60s so the badge stays fresh
  useEffect(() => {
    loadNotifications();
    const id = setInterval(loadNotifications, 60000);
    return () => clearInterval(id);
  }, [loadNotifications]);

  // Close popovers on outside click / Escape
  useEffect(() => {
    function onPointerDown(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  async function markAllRead() {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  }

  async function onNotifClick(n) {
    setNotifOpen(false);
    if (!n.is_read) {
      try {
        await notificationsApi.markRead(n.id);
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
        );
      } catch {
        // Ignore; navigation still proceeds
      }
    }
    if (n.ticket_id) navigate('/tickets');
  }

  async function onLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => {
              setNotifOpen((v) => !v);
              setMenuOpen(false);
            }}
            className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={notifOpen}
          >
            <Bell className="size-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white tabular-nums">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <p className="text-sm font-semibold text-slate-900">Notifications</p>
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <CheckCheck className="size-3.5" aria-hidden="true" />
                  Mark all read
                </button>
              </div>
              <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto scroll-quiet">
                {notifications.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-slate-500">
                    No notifications yet.
                  </li>
                )}
                {notifications.slice(0, 15).map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onNotifClick(n)}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                        n.is_read ? '' : 'bg-brand-50/60'
                      }`}
                    >
                      <p className={`text-sm text-slate-700 ${n.is_read ? '' : 'font-medium'}`}>
                        {n.message}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">{relativeTime(n.created_at)}</p>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-100 px-4 py-2 text-center">
                <Link
                  to="/notifications"
                  onClick={() => setNotifOpen(false)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  View all notifications
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((v) => !v);
              setNotifOpen(false);
            }}
            className="flex items-center gap-2 rounded-lg py-1.5 pr-2 pl-1.5 transition-colors hover:bg-slate-100"
            aria-expanded={menuOpen}
          >
            <Avatar name={user?.full_name} />
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium text-slate-800">{user?.full_name}</span>
              <span className="block text-[11px] text-slate-500">{user?.email}</span>
            </span>
            <ChevronDown className="size-4 text-slate-400" aria-hidden="true" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <div className="border-b border-slate-100 px-4 py-2.5 sm:hidden">
                <p className="text-sm font-medium text-slate-800">{user?.full_name}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                <UserRound className="size-4 text-slate-400" aria-hidden="true" />
                My profile
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
