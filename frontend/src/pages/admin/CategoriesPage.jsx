import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, PencilLine, Trash2, ChevronDown, ChevronRight, FolderTree } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Field, Input, Textarea, Checkbox } from '../../components/ui/Form';
import { SkeletonRows, EmptyState, ErrorState } from '../../components/ui/States';
import Modal, { ConfirmDialog } from '../../components/ui/Modal';
import { categoriesApi } from '../../api';
import { apiErrorMessage } from '../../api/client';

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expanded, setExpanded] = useState(new Set());
  const [modal, setModal] = useState(null); // { mode: 'category'|'subcategory', editing?, categoryId? }
  const [form, setForm] = useState({ name: '', description: '', is_active: true });
  const [formErrors, setFormErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await categoriesApi.list();
      setCategories(data.data || []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleExpand(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCategoryModal(category = null) {
    setModal({ mode: 'category', editing: category });
    setForm(
      category
        ? { name: category.name, description: category.description || '', is_active: category.is_active }
        : { name: '', description: '', is_active: true }
    );
    setFormErrors({});
  }

  function openSubcategoryModal(category) {
    setModal({ mode: 'subcategory', categoryId: category.id, categoryName: category.name });
    setForm({ name: '', is_active: true });
    setFormErrors({});
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setFormErrors({});
    try {
      if (modal.mode === 'category') {
        if (modal.editing) {
          await categoriesApi.update(modal.editing.id, {
            name: form.name.trim(),
            description: form.description.trim() || null,
            is_active: form.is_active,
          });
          toast.success('Category updated.');
        } else {
          await categoriesApi.create({
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            is_active: form.is_active,
          });
          toast.success('Category created.');
        }
      } else {
        await categoriesApi.createSubcategory(modal.categoryId, {
          name: form.name.trim(),
          is_active: form.is_active,
        });
        toast.success('Subcategory added.');
      }
      setModal(null);
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
      await categoriesApi.remove(deleting.id);
      toast.success('Category deleted.');
      setDeleting(null);
      load();
    } catch (err) {
      // PROTECT on tickets — backend refuses to delete categories in use
      toast.error(apiErrorMessage(err, 'This category is in use by tickets and cannot be deleted.'));
      setBusy(false);
    }
  }

  const isCategoryModal = modal?.mode === 'category';

  return (
    <>
      <PageHeader
        title="Categories"
        description="Classify tickets so they route to the right team."
        actions={
          <Button onClick={() => openCategoryModal()}>
            <Plus className="size-4" aria-hidden="true" />
            New category
          </Button>
        }
      />

      <Panel bodyClassName="px-5 py-4">
        {loading ? (
          <SkeletonRows rows={5} cols={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : categories.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="No categories yet"
            message="Create the first category employees will pick when submitting tickets."
            action={<Button size="sm" onClick={() => openCategoryModal()}>New category</Button>}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {categories.map((c) => (
              <li key={c.id}>
                <div className="flex items-center justify-between gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(c.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={expanded.has(c.id)}
                  >
                    {expanded.has(c.id) ? (
                      <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{c.name}</span>
                        {!c.is_active && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                            Inactive
                          </span>
                        )}
                      </span>
                      {c.description && (
                        <span className="mt-0.5 block truncate text-xs text-slate-400">{c.description}</span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {c.subcategories?.length || 0} subcategories
                      </span>
                    </span>
                  </button>
                  <span className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openSubcategoryModal(c)}>
                      <Plus className="size-3.5" aria-hidden="true" />
                      Subcategory
                    </Button>
                    <button
                      type="button"
                      onClick={() => openCategoryModal(c)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
                      aria-label={`Edit ${c.name}`}
                    >
                      <PencilLine className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(c)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label={`Delete ${c.name}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </span>
                </div>

                {expanded.has(c.id) && (
                  <div className="mb-3 ml-6 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
                    {(c.subcategories || []).length ? (
                      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {c.subcategories.map((s) => (
                          <li key={s.id} className="flex items-center justify-between rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-slate-100">
                            <span className={s.is_active ? 'text-slate-700' : 'text-slate-400 line-through'}>
                              {s.name}
                            </span>
                            {!s.is_active && (
                              <span className="text-[11px] text-slate-400">inactive</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-400">No subcategories.</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Category / subcategory modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={
          modal?.mode === 'subcategory'
            ? `Add subcategory to ${modal?.categoryName}`
            : modal?.editing
              ? 'Edit category'
              : 'New category'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button loading={busy} onClick={submit}>
              {modal?.editing && isCategoryModal ? 'Save changes' : 'Create'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="cat-name" error={formErrors.name} required>
            <Input
              id="cat-name"
              value={form.name}
              invalid={!!formErrors.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          {isCategoryModal && (
            <Field label="Description (optional)" htmlFor="cat-desc" error={formErrors.description}>
              <Textarea
                id="cat-desc"
                rows={3}
                value={form.description}
                invalid={!!formErrors.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
          )}
          <Checkbox
            id="cat-active"
            label="Active (selectable when creating tickets)"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={busy}
        danger
        title="Delete category?"
        message={`“${deleting?.name}” and its subcategories will be removed. Categories used by tickets cannot be deleted.`}
        confirmLabel="Delete"
      />
    </>
  );
}
