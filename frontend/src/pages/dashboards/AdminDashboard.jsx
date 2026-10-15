import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Ticket, AlertTriangle, Timer, ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import { Panel, StatCard } from '../../components/ui/Card';
import { SkeletonRows, ErrorState, EmptyState } from '../../components/ui/States';
import { StatusChip, PriorityChip, Avatar } from '../../components/ui/Chips';
import { dashboardsApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { CHART_COLORS } from '../../utils/constants';
import { formatDate, timeUntil } from '../../utils/format';

const CHART_AXIS = { fill: '#64748b', fontSize: 12 };
const CHART_TOOLTIP = {
  contentStyle: {
    borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 1px 2px rgb(0 0 0 / 0.05)',
  },
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data: body } = await dashboardsApi.admin();
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
        <PageHeader title="System overview" />
        <SkeletonRows rows={5} cols={4} />
      </>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const t = data.ticket_stats || {};
  const u = data.user_stats || {};
  const byPriority = (data.by_priority || []).map((r) => ({
    name: r.priority__name || 'Unset',
    count: r.count,
  }));
  const byCategory = (data.by_category || []).map((r) => ({
    name: r.category__name || 'Uncategorized',
    value: r.count,
  }));

  return (
    <>
      <PageHeader
        title="System overview"
        description={`Signed in as ${user?.full_name}. Live operational metrics across all tickets.`}
      />

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total tickets" value={t.total ?? 0} icon={Ticket} />
        <StatCard
          label="Active (open→progress)"
          value={(t.open ?? 0) + (t.assigned ?? 0) + (t.in_progress ?? 0) + (t.waiting ?? 0)}
          icon={Timer}
          tone="info"
        />
        <StatCard label="Critical & unresolved" value={t.critical ?? 0} icon={AlertTriangle} tone="danger" />
        <StatCard label="Overdue" value={t.overdue ?? 0} icon={Timer} tone="warning" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Users" value={u.total_users ?? 0} icon={Users} hint={`${u.active_users ?? 0} active`} />
        <StatCard label="Support agents" value={u.total_agents ?? 0} />
        <StatCard label="Employees" value={u.total_employees ?? 0} />
        <StatCard label="Resolved (all time)" value={t.resolved ?? 0} tone="success" />
      </div>

      {/* Charts */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Panel title="Tickets by priority" className="lg:col-span-2">
          {byPriority.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPriority} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={CHART_AXIS} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={CHART_AXIS} tickLine={false} axisLine={false} />
                  <Tooltip {...CHART_TOOLTIP} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {byPriority.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No data yet" message="Charts appear once tickets exist." />
          )}
        </Panel>

        <Panel title="Tickets by category" className="lg:col-span-3">
          {byCategory.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No data yet" message="Charts appear once tickets exist." />
          )}
        </Panel>
      </div>

      {/* Workload + urgent tickets */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          title="Agent workload"
          subtitle="Active tickets per support agent"
          actions={
            <Link to="/reports" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              Full report <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {(data.agent_workload || []).length ? (
            <ul className="divide-y divide-slate-100">
              {data.agent_workload.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={`${a.first_name} ${a.last_name}`} className="size-7" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {a.first_name} {a.last_name}
                      </span>
                      <span className="block truncate text-xs text-slate-400">{a.email}</span>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-slate-50 px-2.5 py-1 text-sm font-semibold text-slate-700 tabular-nums ring-1 ring-slate-100">
                    {a.active_tickets} active
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No agents yet" message="Create support agent accounts from the Users page." />
          )}
        </Panel>

        <Panel
          title="Urgent tickets"
          subtitle="Critical or overdue, still unresolved"
        >
          {(data.urgent_tickets || []).length ? (
            <ul className="divide-y divide-slate-100">
              {data.urgent_tickets.map((tk) => (
                <li key={tk.id}>
                  <Link to={`/tickets/${tk.id}`} className="block py-2.5 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-slate-800">
                        <span className="mr-2 text-xs text-slate-400 tabular-nums">{tk.ticket_id}</span>
                        {tk.title}
                      </p>
                      <span className="flex shrink-0 items-center gap-2">
                        {tk.is_overdue && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                            <Timer className="size-3.5" aria-hidden="true" />
                            {timeUntil(tk.due_at)}
                          </span>
                        )}
                        <PriorityChip priority={tk.priority_name} />
                        <StatusChip status={tk.status} />
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {tk.created_by_name} · {tk.category_name} · {formatDate(tk.created_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-start gap-2 py-2 text-sm text-slate-500">
              <Ticket className="mt-0.5 size-4 text-green-600" aria-hidden="true" />
              Nothing urgent right now.
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
