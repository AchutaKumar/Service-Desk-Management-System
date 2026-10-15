import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Form';
import { ticketsApi, categoriesApi, departmentsApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { PRIORITY } from '../../utils/constants';

export default function TicketCreatePage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    subcategory: '',
    priority: '',
    department: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [priorities, setPriorities] = useState([]);

  useEffect(() => {
    categoriesApi.list().then(({ data }) => setCategories(data.data || [])).catch(() => {});
    departmentsApi.list().then(({ data }) => setDepartments(data.data || [])).catch(() => {});
    ticketsApi.priorities().then(({ data }) => setPriorities(data.data || [])).catch(() => {});
  }, []);

  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories]);
  const activePriorities = useMemo(() => priorities, [priorities]);
  const selectedCategory = useMemo(
    () => categories.find((c) => String(c.id) === String(form.category)),
    [categories, form.category]
  );
  const selectedPriority = useMemo(
    () => priorities.find((p) => String(p.id) === String(form.priority)),
    [priorities, form.priority]
  );

  const set = (key) => (e) =>
    setForm((f) => ({
      ...f,
      [key]: e.target.value,
      // Reset dependent selections when the parent changes
      ...(key === 'category' ? { subcategory: '' } : {}),
    }));

  async function onSubmit(e) {
    e.preventDefault();
    const next = {};
    if (form.title.trim().length < 5) next.title = 'Title must be at least 5 characters.';
    if (form.description.trim().length < 10)
      next.description = 'Please describe the issue in at least 10 characters.';
    if (!form.category) next.category = 'Choose a category.';
    if (!form.priority) next.priority = 'Choose a priority.';
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error('Please fix the highlighted fields.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: Number(form.category),
        priority: Number(form.priority),
        ...(form.subcategory ? { subcategory: Number(form.subcategory) } : {}),
        ...(form.department ? { department: Number(form.department) } : {}),
      };
      const { data } = await ticketsApi.create(payload);
      toast.success(data.message || 'Ticket created.');
      navigate(`/tickets/${data.data.id}`, { replace: true });
    } catch (error) {
      const serverErrors = error?.response?.data?.errors;
      if (serverErrors && typeof serverErrors === 'object') {
        const mapped = {};
        for (const [key, value] of Object.entries(serverErrors)) {
          mapped[key] = Array.isArray(value) ? value.join(' ') : String(value);
        }
        setErrors(mapped);
      }
      toast.error(apiErrorMessage(error, 'Could not create the ticket.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Link
        to="/tickets"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to tickets
      </Link>

      <PageHeader
        title="Submit a new request"
        description="Describe the issue clearly. A support agent will be assigned automatically."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field
              label="Title"
              htmlFor="t-title"
              error={errors.title}
              required
              hint="A short summary, e.g. “Laptop will not boot past the logo screen”."
            >
              <Input
                id="t-title"
                value={form.title}
                invalid={!!errors.title}
                onChange={set('title')}
                maxLength={255}
              />
            </Field>

            <Field
              label="Description"
              htmlFor="t-description"
              error={errors.description}
              required
              hint="What happened, when it started, and any error messages you saw."
            >
              <Textarea
                id="t-description"
                value={form.description}
                invalid={!!errors.description}
                onChange={set('description')}
                rows={6}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="t-category" error={errors.category} required>
                <Select
                  id="t-category"
                  value={form.category}
                  invalid={!!errors.category}
                  onChange={set('category')}
                >
                  <option value="">Choose a category…</option>
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Subcategory (optional)" htmlFor="t-subcategory" error={errors.subcategory}>
                <Select
                  id="t-subcategory"
                  value={form.subcategory}
                  invalid={!!errors.subcategory}
                  onChange={set('subcategory')}
                  disabled={!selectedCategory}
                >
                  <option value="">
                    {selectedCategory ? 'Choose a subcategory…' : 'Select a category first'}
                  </option>
                  {(selectedCategory?.subcategories || [])
                    .filter((s) => s.is_active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Priority"
                htmlFor="t-priority"
                error={errors.priority}
                required
                hint={
                  selectedPriority
                    ? `Resolution target: ${selectedPriority.sla_hours} hours`
                    : 'Sets the resolution target (SLA).'
                }
              >
                <Select
                  id="t-priority"
                  value={form.priority}
                  invalid={!!errors.priority}
                  onChange={set('priority')}
                >
                  <option value="">Choose a priority…</option>
                  {activePriorities.map((p) => (
                    <option key={p.id} value={p.id}>{PRIORITY[p.name]?.label || p.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Department (optional)" htmlFor="t-department" error={errors.department}>
                <Select
                  id="t-department"
                  value={form.department}
                  invalid={!!errors.department}
                  onChange={set('department')}
                >
                  <option value="">No specific department</option>
                  {departments
                    .filter((d) => d.is_active)
                    .map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </Select>
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Link to="/tickets">
                <Button variant="secondary" type="button">Cancel</Button>
              </Link>
              <Button type="submit" loading={submitting}>Submit request</Button>
            </div>
          </form>
        </Panel>

        {/* Guidance sidebar */}
        <Panel title="Before you submit" className="h-fit">
          <ul className="space-y-3 text-sm text-slate-600">
            {[
              ['Describe the impact', 'Mention whether the issue blocks your work entirely or has a workaround.'],
              ['Add details once', 'Include exact error text, the device name, and when the problem started.'],
              ['Attachments come later', 'Screenshots and logs can be added on the ticket page after submitting.'],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                <div>
                  <p className="font-medium text-slate-800">{title}</p>
                  <p className="mt-0.5 text-slate-500">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          {selectedPriority && (
            <div className="mt-4 rounded-lg bg-brand-50 px-3.5 py-3 ring-1 ring-brand-100">
              <p className="text-xs font-semibold text-brand-800">
                {selectedPriority.name} priority · {selectedPriority.sla_hours}h SLA
              </p>
              {selectedPriority.description && (
                <p className="mt-1 text-xs leading-relaxed text-brand-700">
                  {selectedPriority.description}
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
