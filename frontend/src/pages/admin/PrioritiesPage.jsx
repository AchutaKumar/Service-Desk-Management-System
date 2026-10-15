import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PencilLine, GaugeCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Form';
import { SkeletonRows, ErrorState, EmptyState } from '../../components/ui/States';
import Modal from '../../components/ui/Modal';
import { PriorityChip } from '../../components/ui/Chips';
import { ticketsApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { PRIORITY } from '../../utils/constants';

export default function PrioritiesPage() {
  const [priorities, setPriorities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(null);
  const [slaHours, setSlaHours] = useState('');
  const [slaError, setSlaError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await ticketsApi.priorities();
      setPriorities(data.data || []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openEdit(p) {
    setEditing(p);
    setSlaHours(String(p.sla_hours));
    setSlaError('');
  }

  async function submit(e) {
    e.preventDefault();
    const hours = Number(slaHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      setSlaError('Enter a whole number of hours between 1 and 720 (30 days).');
      return;
    }
    setBusy(true);
    try {
      await ticketsApi.updatePriority(editing.id, { sla_hours: hours });
      toast.success(`SLA for ${editing.name} updated to ${hours}h.`);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Priorities & SLA"
        description="Resolution targets applied to new tickets. Changes take effect for future due dates."
      />

      {loading ? (
        <SkeletonRows rows={4} cols={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : priorities.length === 0 ? (
        <Panel>
          <EmptyState
            icon={GaugeCircle}
            title="No priorities configured"
            message="Run the backend seed command to create default priorities."
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {priorities.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <PriorityChip priority={p.name} />
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                    {p.description || PRIORITY[p.name]?.label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
                  aria-label={`Edit SLA for ${p.name}`}
                >
                  <PencilLine className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4 flex items-baseline gap-1.5 border-t border-slate-100 pt-3">
                <span className="text-2xl font-semibold text-slate-900 tabular-nums">{p.sla_hours}</span>
                <span className="text-sm text-slate-500">hours to resolve</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`SLA target for ${PRIORITY[editing?.name]?.label || editing?.name}`}
        description="Tickets with this priority must be resolved within this window."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={busy} onClick={submit}>Save</Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <Field
            label="Resolution target (hours)"
            htmlFor="sla-hours"
            error={slaError}
            required
            hint="e.g. 2 for critical outages, 72 for low-priority requests."
          >
            <Input
              id="sla-hours"
              type="number"
              min="1"
              max="720"
              value={slaHours}
              invalid={!!slaError}
              onChange={(e) => setSlaHours(e.target.value)}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
