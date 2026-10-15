import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ticket, Clock, CheckCircle2, Hourglass, Plus, ArrowRight,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Panel, StatCard } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { SkeletonRows, ErrorState, EmptyState } from '../../components/ui/States';
import { StatusChip, PriorityChip, SLAChip } from '../../components/ui/Chips';
import { dashboardsApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatDate, timeUntil } from '../../utils/format';

function TicketRow({ t }) {
  return (
    <Link
      to={`/tickets/${t.id}`}
      className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0 hover:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">
          <span className="mr-2 text-xs text-slate-400 tabular-nums">{t.ticket_id}</span>
          {t.title}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          {t.category_name} · created {formatDate(t.created_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <PriorityChip priority={t.priority_name} />
        <StatusChip status={t.status} />
      </div>
    </Link>
  );
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data: body } = await dashboardsApi.employee();
      setData(body.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader title={`Hello, ${user?.first_name}`} />
        <SkeletonRows rows={4} cols={4} />
      </>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const c = data?.ticket_counts || {};
  const hasTickets = (c.total || 0) > 0;

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.first_name}`}
        description="Here's the state of your IT requests."
        actions={
          <Link to="/tickets/new">
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              New ticket
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total tickets" value={c.total ?? 0} icon={Ticket} />
        <StatCard label="Open" value={c.open ?? 0} icon={Hourglass} tone="info" hint={`${(c.assigned ?? 0) + (c.reopened ?? 0)} assigned/reopened`} />
        <StatCard label="In progress" value={(c.in_progress ?? 0) + (c.waiting ?? 0)} icon={Clock} tone="warning" hint={`${c.waiting ?? 0} waiting on you`} />
        <StatCard label="Resolved" value={c.resolved ?? 0} icon={CheckCircle2} tone="success" />
      </div>

      {!hasTickets ? (
        <Panel className="mt-5">
          <EmptyState
            icon={Ticket}
            title="No requests yet"
            message="Submit an IT request and you'll see its progress here — from assignment to resolution."
            action={
              <Link to="/tickets/new">
                <Button size="sm">
                  <Plus className="size-4" aria-hidden="true" />
                  Create your first ticket
                </Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel
            title="Recent tickets"
            actions={
              <Link to="/tickets" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                View all <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          >
            {(data.recent_tickets || []).length ? (
              <div>{data.recent_tickets.map((t) => <TicketRow key={t.id} t={t} />)}</div>
            ) : (
              <p className="py-2 text-sm text-slate-500">Nothing here yet.</p>
            )}
          </Panel>

          <Panel
            title="Needs attention"
            subtitle="High and critical priority tickets still in flight"
          >
            {(data.high_priority_tickets || []).length ? (
              <div>
                {data.high_priority_tickets.map((t) => (
                  <div key={t.id} className="border-b border-slate-100 py-2.5 last:border-0">
                    <Link to={`/tickets/${t.id}`} className="block hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-medium text-slate-800">
                          <span className="mr-2 text-xs text-slate-400 tabular-nums">{t.ticket_id}</span>
                          {t.title}
                        </p>
                        <div className="flex shrink-0 items-center gap-2">
                          {t.due_at && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                              <Clock className="size-3.5" aria-hidden="true" />
                              {timeUntil(t.due_at)}
                            </span>
                          )}
                          <SLAChip slaStatus={t.sla_status} />
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-start gap-2 py-2 text-sm text-slate-500">
                <CheckCircle2 className="mt-0.5 size-4 text-green-600" aria-hidden="true" />
                No high-priority tickets in flight. Well done.
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
