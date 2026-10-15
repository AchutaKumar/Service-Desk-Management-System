import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AuthLayout from './AuthLayout';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Form';
import { authApi } from '../../api';
import { apiErrorMessage } from '../../api/client';

/**
 * Employee self-registration.
 * Backend forces role=EMPLOYEE and leaves department unset
 * (departments are assigned by an admin afterwards).
 */
export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    password_confirm: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!form.first_name.trim()) next.first_name = 'First name is required.';
    if (!form.last_name.trim()) next.last_name = 'Last name is required.';
    if (!form.username.trim()) next.username = 'Username is required.';
    if (!form.email.trim()) next.email = 'Email is required.';
    if (form.password.length < 8) next.password = 'Use at least 8 characters.';
    if (form.password !== form.password_confirm)
      next.password_confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      const payload = { ...form, phone: form.phone.trim() || undefined };
      await authApi.register(payload);
      toast.success('Account created. You can now sign in.');
      navigate('/login', { replace: true });
    } catch (error) {
      const data = error?.response?.data?.errors;
      if (data && typeof data === 'object') {
        const mapped = {};
        for (const [key, value] of Object.entries(data)) {
          mapped[key] = Array.isArray(value) ? value.join(' ') : String(value);
        }
        setErrors(mapped);
        toast.error('Please fix the highlighted fields.');
      } else {
        toast.error(apiErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Registration is for employees who need to submit IT requests."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="reg-first" error={errors.first_name} required>
            <Input id="reg-first" value={form.first_name} invalid={!!errors.first_name} onChange={set('first_name')} autoComplete="given-name" />
          </Field>
          <Field label="Last name" htmlFor="reg-last" error={errors.last_name} required>
            <Input id="reg-last" value={form.last_name} invalid={!!errors.last_name} onChange={set('last_name')} autoComplete="family-name" />
          </Field>
        </div>

        <Field label="Username" htmlFor="reg-username" error={errors.username} required>
          <Input id="reg-username" value={form.username} invalid={!!errors.username} onChange={set('username')} autoComplete="username" />
        </Field>

        <Field label="Work email" htmlFor="reg-email" error={errors.email} required>
          <Input id="reg-email" type="email" value={form.email} invalid={!!errors.email} onChange={set('email')} autoComplete="email" placeholder="you@company.com" />
        </Field>

        <Field label="Phone (optional)" htmlFor="reg-phone" error={errors.phone}>
          <Input id="reg-phone" value={form.phone} invalid={!!errors.phone} onChange={set('phone')} autoComplete="tel" placeholder="Extension or mobile" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="reg-password" error={errors.password} required hint="At least 8 characters.">
            <Input id="reg-password" type="password" value={form.password} invalid={!!errors.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" htmlFor="reg-confirm" error={errors.password_confirm} required>
            <Input id="reg-confirm" type="password" value={form.password_confirm} invalid={!!errors.password_confirm} onChange={set('password_confirm')} autoComplete="new-password" />
          </Field>
        </div>

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
