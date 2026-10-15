import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Field, Input, Select, Checkbox } from '../../components/ui/Form';
import { Table, THead, Td } from '../../components/ui/Table';
import Pagination from '../../components/ui/Pagination';
import { SkeletonRows, EmptyState, ErrorState } from '../../components/ui/States';
import Modal, { ConfirmDialog } from '../../components/ui/Modal';
import { StatusChip, SLAChip, PriorityChip, Avatar } from '../../components/ui/Chips';
import { ticketsApi, categoriesApi, usersApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../../utils/constants';
import { formatDateTime, timeUntil } from '../../utils/format';

export default function TicketsPage() {
  const { user, isAdmin, isAgent } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState({ results: [], count: 0, total_pages: 1, current_page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [agents, setAgents] = useState([]);

  const [selected, setSelected] = useState(new Set());
  const [bulkTarget, setBulkTarget] = useState(null); // 'assign' | 'close'
  const [bulkAgent, setBulkAgent] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const filters = useMemo(() => {
    const p = searchParams;
    return {
      status: p.get('status') || '',
      priority__name: p.get('priority__name') || '',
      category: p.get('category') || '',
      is_overdue: p.get('is_overdue') || '',
      search: p.get('search') || '',
      ordering: p.get('ordering') || '-created_at',
      page: p.get('page') || '1',
      page_size: p.get('page_size') || '10',
    };
  }, [searchParams]);

  const setFilter = useCallback(
    (key, value) => {
      setSelected(new Set());
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page'); // reset paging on filter change
        return next;
      });
    },
    [setSearchParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      );
      const { data: body } = await ticketsApi.list(params);
      setData({
        results: body.results || [],
        count: body.count ?? 0,
        total_pages: body.total_pages ?? 1,
        current_page: body.current_page ?? 1,
        next: body.next,
        previous: body.previous,
      });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load tickets.'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Reference data for filter dropdowns / bulk assign
  useEffect(() => {
    categoriesApi
      .list()
      .then(({ data }) => setCategories(data.data || []))
      .catch(() => {});
    if (isAdmin) {
      usersApi
        .agents()
        .then(({ data }) => setAgents(data.data || []))
        .catch(() => {});
    }
  }, [isAdmin]);

  const canCreate = user?.role !== 'SUPPORT_AGENT';
  const hasFilters =
    filters.status || filters.priority__name || filters.category || filters.is_overdue || filters.search;

  function toggleRow(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === data.results.length ? new Set() : new Set(data.results.map((t) => t.id))
    );
  }

  async function runBulkAssign() {
    if (!bulkAgent) return;
    setBulkBusy(true);
    try {
      const { data: body } = await ticketsApi.bulkAction({
        action: 'bulk_assign',
        ticket_ids: [...selected],
        agent_id: Number(bulkAgent),
      });
      toast.success(body.message || 'Tickets assigned.');
      setBulkTarget(null);
      setSelected(new Set());
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkClose() {
    setBulkBusy(true);
    try {
      const { data: body } = await ticketsApi.bulkAction({
        action: 'bulk_close',
        ticket_ids: [...selected],
      });
      toast.success(body.message || 'Tickets closed.');
      setBulkTarget(null);
      setSelected(new Set());
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  }

  const columns = [
    ...(isAdmin ? [{ key: 'select', label: '' }] : []),
    { key: 'ticket', label: 'Ticket' },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Priority' },
    { key: 'category', label: 'Category' },
    { key: 'people', label: isAgent ? 'Requester' : 'Assigned to' },
    { key: 'sla', label: 'SLA' },
    { key: 'created', label: 'Created' },
  ];

  return (
    <>
      <PageHeader
        title={isAgent ? 'Ticket queue' : 'My tickets'}
        description={
          isAgent
            ? 'Tickets assigned to you, plus unassigned tickets waiting to be picked up.'
            : 'All the IT requests you have submitted.'
        }
        actions={
          canCreate ? (
            <Link to="/tickets/new">
              <Button>
                <Plus className="size-4" aria-hidden="true" />
                New ticket
              </Button>
            </Link>
          ) : null
        }
      />

      <Panel
        bodyClassName="px-5 py-4"
        title={undefined}
        actions={undefined}
      >
        {/* Filter bar */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-1">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-slate-400" aria-hidden="true" />
            <Input
              aria-label="Search tickets"
              placeholder="Search tickets…"
              defaultValue={filters.search}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setFilter('search', e.currentTarget.value.trim());
              }}
              className="pl-8"
            />
          </div>

          <Select
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>

          <Select
            aria-label="Filter by priority"
            value={filters.priority__name}
            onChange={(e) => setFilter('priority__name', e.target.value)}
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>

          <Select
            aria-label="Filter by category"
            value={filters.category}
            onChange={(e) => setFilter('category', e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>

          <div className="flex items-center justify-between gap-2">
            <Checkbox
              id="filter-overdue"
              label="Overdue only"
              checked={filters.is_overdue === 'true'}
              onChange={(e) => setFilter('is_overdue', e.target.checked ? 'true' : '')}
            />
            {hasFilters && (
              <button
                type="button"
                onClick={() => setSearchParams({})}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                <X className="size-3.5" aria-hidden="true" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Admin bulk toolbar */}
        {isAdmin && selected.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 ring-1 ring-brand-100">
            <p className="text-sm font-medium text-brand-800">
              {selected.size} selected
            </p>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setBulkTarget('assign')}>
                Assign to agent…
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setBulkTarget('close')}>
                Close resolved…
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <SkeletonRows rows={6} cols={7} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : data.results.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No tickets match these filters' : 'No tickets yet'}
            message={
              hasFilters
                ? 'Try adjusting or clearing the filters above.'
                : canCreate
                  ? 'Submit your first IT request to get started.'
                  : 'New requests assigned to you will appear here.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={() => setSearchParams({})}>
                  Clear filters
                </Button>
              ) : canCreate ? (
                <Link to="/tickets/new">
                  <Button size="sm">
                    <Plus className="size-4" aria-hidden="true" />
                    New ticket
                  </Button>
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <THead columns={columns} />
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((t) => (
                    <tr
                      key={t.id}
                      className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                        selected.has(t.id) ? 'bg-brand-50/50' : ''
                      }`}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                    >
                      {isAdmin && (
                        <Td>
                          <span onClick={(e) => e.stopPropagation()} className="inline-flex">
                            <input
                              type="checkbox"
                              aria-label={`Select ticket ${t.ticket_id}`}
                              className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                              checked={selected.has(t.id)}
                              onChange={() => toggleRow(t.id)}
                            />
                          </span>
                        </Td>
                      )}
                      <Td>
                        <p className="font-medium text-slate-900">
                          <span className="mr-2 text-xs font-semibold text-slate-400 tabular-nums">
                            {t.ticket_id}
                          </span>
                          {t.title}
                        </p>
                      </Td>
                      <Td><StatusChip status={t.status} /></Td>
                      <Td><PriorityChip priority={t.priority_name} /></Td>
                      <Td className="text-slate-500">{t.category_name}</Td>
                      <Td>
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <Avatar name={isAgent ? t.created_by_name : t.assigned_to_name} className="size-6" />
                          {(isAgent ? t.created_by_name : t.assigned_to_name) || 'Unassigned'}
                        </span>
                      </Td>
                      <Td>
                        <span className="flex flex-col gap-1">
                          <SLAChip slaStatus={t.sla_status} />
                          {t.due_at && !['RESOLVED', 'CLOSED'].includes(t.status) && (
                            <span className="text-[11px] text-slate-400 tabular-nums">
                              {timeUntil(t.due_at)}
                            </span>
                          )}
                        </span>
                      </Td>
                      <Td className="text-slate-500 whitespace-nowrap tabular-nums">
                        {formatDateTime(t.created_at)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-2.5 md:hidden">
              {data.results.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/tickets/${t.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-brand-300"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-400 tabular-nums">{t.ticket_id}</span>
                      <StatusChip status={t.status} />
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-slate-900">{t.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <PriorityChip priority={t.priority_name} />
                      <SLAChip slaStatus={t.sla_status} />
                      <span>{t.category_name}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">{formatDateTime(t.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>

            <Pagination
              meta={data}
              onPageChange={(page) => {
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('page', String(page));
                  return next;
                });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </Panel>

      {/* Bulk assign modal */}
      <Modal
        open={bulkTarget === 'assign'}
        onClose={() => setBulkTarget(null)}
        title={`Assign ${selected.size} ticket${selected.size === 1 ? '' : 's'}`}
        description="Selected tickets will be assigned to the chosen agent."
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkTarget(null)}>Cancel</Button>
            <Button loading={bulkBusy} onClick={runBulkAssign} disabled={!bulkAgent}>
              Assign
            </Button>
          </>
        }
      >
        <Field label="Support agent" htmlFor="bulk-agent" required>
          <Select id="bulk-agent" value={bulkAgent} onChange={(e) => setBulkAgent(e.target.value)}>
            <option value="">Choose an agent…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name} ({a.email})
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      {/* Bulk close confirmation */}
      <ConfirmDialog
        open={bulkTarget === 'close'}
        onClose={() => setBulkTarget(null)}
        onConfirm={runBulkClose}
        loading={bulkBusy}
        title="Close resolved tickets?"
        message={`${selected.size} selected ticket(s) will be closed. Only tickets in “Resolved” state can be closed; others are skipped.`}
        confirmLabel="Close tickets"
      />
    </>
  );
}
