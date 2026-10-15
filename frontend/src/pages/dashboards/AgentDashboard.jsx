import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox, Activity, Timer, CheckCircle2, AlertTriangle, ArrowRight,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Panel, StatCard } from '../../components/ui/Card';
import { SkeletonRows, ErrorState, EmptyState } from '../../components/ui/States';
import { StatusChip, PriorityChip, SLAChip } from '../../components/ui/Chips';
import { dashboardsApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatDate, timeUntil } from '../../utils/format';

function CompactTicket({ t, badge }) {
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
          {t.created_by_name} · {t.category_name} · {formatDate(t.created_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badge}
        <PriorityChip priority={t.priority_name} />
      </div>
    </Link>
  );
}

export default function AgentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data: body } = await dashboardsApi.agent();
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
  const nearSla = data?.near_sla_breach || [];
  const available = data?.available_tickets || [];

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.first_name}`}
        description="Your workload and the requests waiting for pickup."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Assigned to you" value={c.total_assigned ?? 0} icon={Inbox} />
        <StatCard label="In progress" value={c.in_progress ?? 0} icon={Activity} tone="info" hint={`${c.waiting ?? 0} waiting on user`} />
        <StatCard label="Near SLA breach" value={nearSla.length} icon={Timer} tone="warning" hint="Due within 2 hours" />
        <StatCard label="Overdue" value={c.overdue ?? 0} icon={AlertTriangle} tone="danger" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          title="Act soon"
          subtitle="Tickets approaching their SLA deadline"
        >
          {nearSla.length ? (
            <div>
              {nearSla.map((t) => (
                <CompactTicket
                  key={t.id}
                  t={t}
                  badge={
                    <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-amber-700">
                      <Timer className="size-3.5" aria-hidden="true" />
                      {timeUntil(t.due_at)}
                    </span>
                  }
                />
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-2 py-2 text-sm text-slate-500">
              <CheckCircle2 className="mt-0.5 size-4 text-green-600" aria-hidden="true" />
              Nothing is close to breaching right now.
            </div>
          )}
        </Panel>

        <Panel
          title="Unassigned requests"
          subtitle="Open tickets waiting for an agent"
          actions={
            <Link to="/tickets" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              Open queue <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {available.length ? (
            <div>
              {available.map((t) => (
                <CompactTicket key={t.id} t={t} badge={<StatusChip status={t.status} />} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Inbox}
              title="Queue is clear"
              message="No unassigned requests right now."
            />
          )}
        </Panel>
      </div>

      {c.resolved > 0 && (
        <p className="mt-4 text-xs text-slate-400">
          {c.resolved} ticket{c.resolved === 1 ? '' : 's'} resolved on your record.
        </p>
      )}
    </>
  );
}
