import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../components/ui/PageHeader';
import { Panel } from '../components/ui/Card';
import Button from '../components/ui/Button';
import { SkeletonRows, ErrorState, EmptyState } from '../components/ui/States';
import { notificationsApi } from '../api';
import { apiErrorMessage } from '../api/client';
import { formatDateTime, relativeTime } from '../utils/format';

export default function NotificationsPage() {
  const [data, setData] = useState({ notifications: [], unread_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: body } = await notificationsApi.list();
      setData(body.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id) {
    try {
      await notificationsApi.markRead(id);
      setData((prev) => ({
        unread_count: Math.max(0, prev.unread_count - 1),
        notifications: prev.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      }));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function markAllRead() {
    try {
      await notificationsApi.markAllRead();
      setData((prev) => ({
        unread_count: 0,
        notifications: prev.notifications.map((n) => ({ ...n, is_read: true })),
      }));
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          data.unread_count > 0
            ? `${data.unread_count} unread notification${data.unread_count === 1 ? '' : 's'}.`
            : 'You are all caught up.'
        }
        actions={
          data.unread_count > 0 ? (
            <Button variant="secondary" size="sm" onClick={markAllRead}>
              <CheckCheck className="size-4" aria-hidden="true" />
              Mark all read
            </Button>
          ) : null
        }
      />

      <Panel bodyClassName="px-5 py-2">
        {loading ? (
          <div className="py-3">
            <SkeletonRows rows={6} cols={2} />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : data.notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            message="You'll be notified when tickets are assigned, commented on, or change status."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.notifications.map((n) => (
              <li
                key={n.id}
                className={`flex items-start justify-between gap-4 py-3.5 ${n.is_read ? '' : 'bg-brand-50/40'}`}
              >
                <div className="flex min-w-0 gap-3">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${n.is_read ? 'bg-slate-200' : 'bg-brand-500'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className={`text-sm text-slate-700 ${n.is_read ? '' : 'font-medium'}`}>{n.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {n.ticket_id && (
                        <span className="mr-2 font-medium text-slate-500 tabular-nums">{n.ticket_id}</span>
                      )}
                      {relativeTime(n.created_at)} · {formatDateTime(n.created_at)}
                    </p>
                  </div>
                </div>
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="mt-3 text-xs text-slate-400">
        Showing the {data.notifications.length} most recent notifications.
      </p>
    </>
  );
}
