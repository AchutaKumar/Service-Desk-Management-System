import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3, Timer, Target, CheckCircle2, AlertTriangle, Download,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import { Panel, StatCard } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Form';
import { Table, THead, Td } from '../../components/ui/Table';
import { SkeletonRows, ErrorState, EmptyState } from '../../components/ui/States';
import { StatusChip, PriorityChip, SLAChip, Avatar } from '../../components/ui/Chips';
import { reportsApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { REPORT_RANGES, CHART_COLORS, TICKET_STATUS, PRIORITY } from '../../utils/constants';
import { formatDate, formatDateTime, timeUntil } from '../../utils/format';

const AXIS_TICK = { fill: '#64748b', fontSize: 12 };
const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 1px 2px rgb(0 0 0 / 0.05)',
  },
};

function SimpleBarChart({ data, nameKey, labelMap }) {
  const chartData = data.map((r) => ({
    name: labelMap?.[r[nameKey]] || r[nameKey] || '—',
    count: r.count,
  }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={56} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Client-side CSV export of the overdue list (no backend CSV endpoint exists). */
function exportCsv(rows) {
  const header = ['Ticket ID', 'Title', 'Status', 'Priority', 'Category', 'Created by', 'Assigned to', 'Due at'];
  const lines = rows.map((t) =>
    [t.ticket_id, t.title, t.status, t.priority_name, t.category_name, t.created_by_name, t.assigned_to_name || 'Unassigned', t.due_at || '']
      .map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`)
      .join(',')
  );
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `overdue-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [range, setRange] = useState('last30');
  const [custom, setCustom] = useState({ date_from: '', date_to: '' });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const params = useCallback(
    () => (range === 'custom' ? { range, ...custom } : { range }),
    [range, custom]
  );

  const load = useCallback(async () => {
    if (range === 'custom' && (!custom.date_from || !custom.date_to)) return;
    setLoading(true);
    setError('');
    try {
      const p = params();
      const [status, priority, category, department, workload, sla, overdue] = await Promise.all([
        reportsApi.byStatus(p),
        reportsApi.byPriority(p),
        reportsApi.byCategory(p),
        reportsApi.byDepartment(p),
        reportsApi.agentWorkload(),
        reportsApi.slaPerformance(p),
        reportsApi.overdueTickets(),
      ]);
      setData({
        status: status.data.data,
        priority: priority.data.data,
        category: category.data.data,
        department: department.data.data,
        workload: workload.data.data,
        sla: sla.data.data,
        overdue: overdue.data.data,
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [range, custom, params]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, custom.date_from, custom.date_to]);

  const statusLabelMap = Object.fromEntries(
    Object.entries(TICKET_STATUS).map(([k, v]) => [k, v.label])
  );
  const priorityLabelMap = Object.fromEntries(
    Object.entries(PRIORITY).map(([k, v]) => [k, v.label])
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational statistics across all tickets."
      />

      {/* Range selector */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Time range" htmlFor="range">
            <Select id="range" value={range} onChange={(e) => setRange(e.target.value)}>
              {REPORT_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>
          {range === 'custom' && (
            <>
              <Field label="From" htmlFor="date-from">
                <Input
                  id="date-from"
                  type="date"
                  value={custom.date_from}
                  onChange={(e) => setCustom((c) => ({ ...c, date_from: e.target.value }))}
                />
              </Field>
              <Field label="To" htmlFor="date-to">
                <Input
                  id="date-to"
                  type="date"
                  value={custom.date_to}
                  onChange={(e) => setCustom((c) => ({ ...c, date_to: e.target.value }))}
                />
              </Field>
              <div className="flex items-end">
                <Button onClick={load} className="w-full">Apply</Button>
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={5} cols={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <EmptyState title="No data" message="Choose a valid date range to see reports." />
      ) : (
        <>
          {/* SLA summary */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Tickets in range" value={data.sla.total ?? 0} icon={BarChart3} />
            <StatCard label="Resolved" value={data.sla.resolved ?? 0} icon={CheckCircle2} tone="success" />
            <StatCard label="Resolved within SLA" value={data.sla.within_sla ?? 0} icon={Target} tone="info" />
            <StatCard
              label="SLA compliance"
              value={data.sla.sla_compliance_rate ?? '0%'}
              icon={Target}
              tone={(parseFloat(data.sla.sla_compliance_rate) || 0) >= 80 ? 'success' : 'warning'}
            />
          </div>

          {/* Charts */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel title="Tickets by status">
              {data.status.results?.length ? (
                <SimpleBarChart data={data.status.results} nameKey="status" labelMap={statusLabelMap} />
              ) : (
                <EmptyState title="No tickets in range" message="Nothing was created in this period." />
              )}
            </Panel>
            <Panel title="Tickets by priority">
              {data.priority.results?.length ? (
                <SimpleBarChart data={data.priority.results} nameKey="priority__name" labelMap={priorityLabelMap} />
              ) : (
                <EmptyState title="No tickets in range" message="Nothing was created in this period." />
              )}
            </Panel>
            <Panel title="Tickets by category">
              {data.category.results?.length ? (
                <SimpleBarChart data={data.category.results} nameKey="category__name" />
              ) : (
                <EmptyState title="No tickets in range" message="Nothing was created in this period." />
              )}
            </Panel>
            <Panel title="Tickets by department">
              {data.department.results?.length ? (
                <SimpleBarChart data={data.department.results} nameKey="department__name" />
              ) : (
                <EmptyState title="No tickets in range" message="Nothing was created in this period." />
              )}
            </Panel>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Agent workload */}
            <Panel title="Agent workload" subtitle="Current assignments across the team">
              {data.workload.results?.length ? (
                <Table>
                  <THead
                    columns={[
                      { key: 'agent', label: 'Agent' },
                      { key: 'active', label: 'Active' },
                      { key: 'resolved', label: 'Resolved' },
                      { key: 'total', label: 'Total assigned' },
                    ]}
                  />
                  <tbody className="divide-y divide-slate-100">
                    {data.workload.results.map((a) => (
                      <tr key={a.id} className="transition-colors hover:bg-slate-50">
                        <Td>
                          <span className="flex items-center gap-2">
                            <Avatar name={`${a.first_name} ${a.last_name}`} className="size-7" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-900">
                                {a.first_name} {a.last_name}
                              </span>
                              <span className="block truncate text-xs text-slate-400">{a.email}</span>
                            </span>
                          </span>
                        </Td>
                        <Td className="tabular-nums">{a.active}</Td>
                        <Td className="tabular-nums">{a.resolved}</Td>
                        <Td className="tabular-nums">{a.total_assigned}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <EmptyState title="No agents" message="No active support agents found." />
              )}
            </Panel>

            {/* Overdue tickets */}
            <Panel
              title={`Overdue tickets (${data.overdue.count ?? 0})`}
              subtitle="Past due date and not yet resolved"
              actions={
                data.overdue.tickets?.length ? (
                  <Button size="sm" variant="secondary" onClick={() => exportCsv(data.overdue.tickets)}>
                    <Download className="size-4" aria-hidden="true" />
                    Export CSV
                  </Button>
                ) : null
              }
            >
              {data.overdue.tickets?.length ? (
                <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto scroll-quiet">
                  {data.overdue.tickets.map((t) => (
                    <li key={t.id}>
                      <Link to={`/tickets/${t.id}`} className="block py-2.5 hover:bg-slate-50">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-medium text-slate-800">
                            <span className="mr-2 text-xs text-slate-400 tabular-nums">{t.ticket_id}</span>
                            {t.title}
                          </p>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                              <Timer className="size-3.5" aria-hidden="true" />
                              {timeUntil(t.due_at)}
                            </span>
                            <PriorityChip priority={t.priority_name} />
                          </span>
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <StatusChip status={t.status} />
                          <SLAChip slaStatus={t.sla_status} />
                          <span>{t.assigned_to_name || 'Unassigned'}</span>
                          <span>· due {formatDateTime(t.due_at)}</span>
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-start gap-2 py-2 text-sm text-slate-500">
                  <CheckCircle2 className="mt-0.5 size-4 text-green-600" aria-hidden="true" />
                  No overdue tickets. Everything is within target.
                </div>
              )}
            </Panel>
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Reports include tickets created between{' '}
            {data.status.date_from ? formatDate(data.status.date_from) : '—'} and{' '}
            {data.status.date_to ? formatDate(data.status.date_to) : '—'} (custom ranges excluded).
          </p>
        </>
      )}
    </>
  );
}
