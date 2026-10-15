import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, PencilLine, UserCheck, UserX } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Field, Input, Select, Checkbox } from '../../components/ui/Form';
import { Table, THead, Td } from '../../components/ui/Table';
import { SkeletonRows, EmptyState, ErrorState } from '../../components/ui/States';
import Modal, { ConfirmDialog } from '../../components/ui/Modal';
import { RoleChip, Avatar } from '../../components/ui/Chips';
import { usersApi, departmentsApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { ROLE_OPTIONS } from '../../utils/constants';
import { formatDate } from '../../utils/format';

const EMPTY_FORM = {
  email: '', username: '', first_name: '', last_name: '', phone: '',
  role: 'EMPLOYEE', department_id: '', password: '', is_active: true,
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState([]);

  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // user being edited
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [deactivating, setDeactivating] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (roleFilter) params.role = roleFilter;
      if (activeFilter) params.is_active = activeFilter;
      const { data } = await usersApi.list(params);
      setUsers(data.data || []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [roleFilter, activeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    departmentsApi.list().then(({ data }) => setDepartments(data.data || [])).catch(() => {});
  }, []);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const closeModal = useCallback(() => setModalOpen(false), []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalOpen(true);
  }

  function openEdit(user) {
    setEditing(user);
    setForm({
      email: user.email,
      username: user.username,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone: user.phone || '',
      role: user.role,
      department_id: user.department ?? '',
      password: '',
      is_active: user.is_active,
    });
    setFormErrors({});
    setModalOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setFormErrors({});
    try {
      if (editing) {
        const payload = {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          department_id: form.department_id ? Number(form.department_id) : null,
          is_active: form.is_active,
        };
        await usersApi.update(editing.id, payload);
        toast.success('User updated.');
      } else {
        if (!form.password || form.password.length < 8) {
          setFormErrors({ password: 'Use at least 8 characters.' });
          setBusy(false);
          return;
        }
        await usersApi.create({
          email: form.email.trim(),
          username: form.username.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim() || undefined,
          role: form.role,
          department_id: form.department_id ? Number(form.department_id) : undefined,
          password: form.password,
          is_active: form.is_active,
        });
        toast.success('User created.');
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

  async function toggleActive() {
    if (!deactivating) return;
    setBusy(true);
    try {
      if (deactivating.is_active) {
        await usersApi.deactivate(deactivating.id);
        toast.success(`${deactivating.full_name} deactivated.`);
      } else {
        await usersApi.activate(deactivating.id);
        toast.success(`${deactivating.full_name} activated.`);
      }
      setDeactivating(null);
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
        title="User management"
        description="Create accounts, assign roles, and control access."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" aria-hidden="true" />
            New user
          </Button>
        }
      />

      <Panel bodyClassName="px-5 py-4">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select aria-label="Filter by status" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
            <option value="">Active and inactive</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </Select>
        </div>

        {loading ? (
          <SkeletonRows rows={6} cols={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : users.length === 0 ? (
          <EmptyState title="No users found" message="Try different filters or create a user." />
        ) : (
          <Table>
            <THead
              columns={[
                { key: 'user', label: 'User' },
                { key: 'role', label: 'Role' },
                { key: 'dept', label: 'Department' },
                { key: 'status', label: 'Status' },
                { key: 'joined', label: 'Joined' },
                { key: 'actions', label: '', align: 'right' },
              ]}
            />
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-slate-50">
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={u.full_name} className="size-8" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{u.full_name}</span>
                        <span className="block truncate text-xs text-slate-400">{u.email}</span>
                      </span>
                    </span>
                  </Td>
                  <Td><RoleChip role={u.role} /></Td>
                  <Td className="text-slate-500">{u.department_name || '—'}</Td>
                  <Td>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        u.is_active
                          ? 'bg-green-50 text-green-700 ring-green-200'
                          : 'bg-slate-100 text-slate-500 ring-slate-200'
                      }`}
                    >
                      <span className={`size-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-slate-400'}`} aria-hidden="true" />
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                  <Td className="text-slate-500 whitespace-nowrap">{formatDate(u.date_joined)}</Td>
                  <Td align="right">
                    <span className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
                        aria-label={`Edit ${u.full_name}`}
                      >
                        <PencilLine className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeactivating(u)}
                        className={`rounded-lg p-1.5 transition-colors ${
                          u.is_active
                            ? 'text-slate-400 hover:bg-red-50 hover:text-red-600'
                            : 'text-slate-400 hover:bg-green-50 hover:text-green-600'
                        }`}
                        aria-label={`${u.is_active ? 'Deactivate' : 'Activate'} ${u.full_name}`}
                      >
                        {u.is_active ? <UserX className="size-4" aria-hidden="true" /> : <UserCheck className="size-4" aria-hidden="true" />}
                      </button>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit ${editing.full_name}` : 'Create user'}
        description={editing ? 'Update account details and role.' : 'All fields with * are required.'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button loading={busy} onClick={submit}>
              {editing ? 'Save changes' : 'Create user'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="u-first" error={formErrors.first_name} required>
            <Input id="u-first" value={form.first_name} invalid={!!formErrors.first_name} onChange={set('first_name')} />
          </Field>
          <Field label="Last name" htmlFor="u-last" error={formErrors.last_name} required>
            <Input id="u-last" value={form.last_name} invalid={!!formErrors.last_name} onChange={set('last_name')} />
          </Field>

          <Field label="Email" htmlFor="u-email" error={formErrors.email} required>
            <Input
              id="u-email"
              type="email"
              value={form.email}
              disabled={!!editing}
              invalid={!!formErrors.email}
              onChange={set('email')}
            />
          </Field>
          <Field label="Username" htmlFor="u-username" error={formErrors.username} required>
            <Input id="u-username" value={form.username} disabled={!!editing} invalid={!!formErrors.username} onChange={set('username')} />
          </Field>

          <Field label="Role" htmlFor="u-role" error={formErrors.role} required>
            <Select id="u-role" value={form.role} onChange={set('role')}>
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Department" htmlFor="u-dept" error={formErrors.department_id}>
            <Select id="u-dept" value={form.department_id} onChange={set('department_id')}>
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Phone (optional)" htmlFor="u-phone" error={formErrors.phone}>
            <Input id="u-phone" value={form.phone} invalid={!!formErrors.phone} onChange={set('phone')} />
          </Field>

          {!editing && (
            <Field label="Temporary password" htmlFor="u-password" error={formErrors.password} required hint="Min. 8 characters. Share it securely; the user can change it later.">
              <Input
                id="u-password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                invalid={!!formErrors.password}
                onChange={set('password')}
              />
            </Field>
          )}

          <div className="sm:col-span-2">
            <Checkbox
              id="u-active"
              label="Account is active (can sign in)"
              checked={form.is_active}
              onChange={set('is_active')}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={toggleActive}
        loading={busy}
        danger={!!deactivating?.is_active}
        title={deactivating?.is_active ? 'Deactivate account?' : 'Activate account?'}
        message={
          deactivating?.is_active
            ? `${deactivating?.full_name} will no longer be able to sign in. Existing tickets are kept.`
            : `${deactivating?.full_name} will be able to sign in again.`
        }
        confirmLabel={deactivating?.is_active ? 'Deactivate' : 'Activate'}
      />
    </>
  );
}
