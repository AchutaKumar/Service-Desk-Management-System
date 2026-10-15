import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, PencilLine, Trash2, Building2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Field, Input, Textarea, Checkbox } from '../../components/ui/Form';
import { Table, THead, Td } from '../../components/ui/Table';
import { SkeletonRows, EmptyState, ErrorState } from '../../components/ui/States';
import Modal, { ConfirmDialog } from '../../components/ui/Modal';
import { departmentsApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { formatDate } from '../../utils/format';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', is_active: true });
  const [formErrors, setFormErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await departmentsApi.list();
      setDepartments(data.data || []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', description: '', is_active: true });
    setFormErrors({});
    setModalOpen(true);
  }

  function openEdit(dept) {
    setEditing(dept);
    setForm({ name: dept.name, description: dept.description || '', is_active: dept.is_active });
    setFormErrors({});
    setModalOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setFormErrors({});
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
      };
      if (editing) {
        await departmentsApi.update(editing.id, payload);
        toast.success('Department updated.');
      } else {
        await departmentsApi.create(payload);
        toast.success('Department created.');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      const data = err?.response?.data?.errors;
      if (data && typeof data === 'object') {
        const mapped = {};
        for (const [key, value] of Object.entries(data)) {
          mapped[key] = Array.isArray(value) ? value.join(' ') : String(value);
        }
        setFormErrors(mapped);
      }
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await departmentsApi.remove(deleting.id);
      toast.success('Department deleted.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'This department still has members or tickets and cannot be deleted.'));
      setBusy(false);
    }
  }

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <>
      <PageHeader
        title="Departments"
        description="Organizational units employees belong to."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" />
            New department
          </Button>
        }
      />

      <Panel bodyClassName="px-5 py-4">
        {loading ? (
          <SkeletonRows rows={5} cols={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : departments.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No departments yet"
            message="Create departments so users and tickets can be organized."
            action={<Button size="sm" onClick={openCreate}>New department</Button>}
          />
        ) : (
          <Table>
            <THead
              columns={[
                { key: 'name', label: 'Department' },
                { key: 'members', label: 'Members' },
                { key: 'status', label: 'Status' },
                { key: 'created', label: 'Created' },
                { key: 'actions', label: '', align: 'right' },
              ]}
            />
            <tbody className="divide-y divide-slate-100">
              {departments.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-slate-50">
                  <Td>
                    <p className="font-medium text-slate-900">{d.name}</p>
                    {d.description && <p className="mt-0.5 text-xs text-slate-400">{d.description}</p>}
                  </Td>
                  <Td className="tabular-nums">{d.user_count ?? 0}</Td>
                  <Td>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        d.is_active
                          ? 'bg-green-50 text-green-700 ring-green-200'
                          : 'bg-slate-100 text-slate-500 ring-slate-200'
                      }`}
                    >
                      <span className={`size-1.5 rounded-full ${d.is_active ? 'bg-green-500' : 'bg-slate-400'}`} aria-hidden="true" />
                      {d.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                  <Td className="text-slate-500 whitespace-nowrap">{formatDate(d.created_at)}</Td>
                  <Td align="right">
                    <span className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(d)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
                        aria-label={`Edit ${d.name}`}
                      >
                        <PencilLine className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(d)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${d.name}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New department'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={submit}>{editing ? 'Save changes' : 'Create'}</Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="dep-name" error={formErrors.name} required>
            <Input id="dep-name" value={form.name} invalid={!!formErrors.name} onChange={set('name')} />
          </Field>
          <Field label="Description (optional)" htmlFor="dep-desc" error={formErrors.description}>
            <Textarea
              id="dep-desc"
              rows={3}
              value={form.description}
              invalid={!!formErrors.description}
              onChange={set('description')}
            />
          </Field>
          <Checkbox id="dep-active" label="Active" checked={form.is_active} onChange={set('is_active')} />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        danger
        title="Delete department?"
        message={`“${deleting?.name}” will be removed. Departments in use cannot be deleted.`}
        confirmLabel="Delete"
      />
    </>
  );
}
