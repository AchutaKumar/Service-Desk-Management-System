import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AuthLayout from './AuthLayout';
import Button from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Form';
import { authApi } from '../../api';
import { apiErrorMessage } from '../../api/client';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!token.trim()) next.token = 'Reset token is required.';
    if (password.length < 8) next.new_password = 'Use at least 8 characters.';
    if (password !== confirm) next.new_password_confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await authApi.confirmPasswordReset({
        token: token.trim(),
        new_password: password,
        new_password_confirm: confirm,
      });
      toast.success('Password updated. You can now sign in.');
      navigate('/login', { replace: true });
    } catch (error) {
      const data = error?.response?.data?.errors;
      if (data && typeof data === 'object') {
        const mapped = {};
        for (const [key, value] of Object.entries(data)) {
          mapped[key] = Array.isArray(value) ? value.join(' ') : String(value);
        }
        setErrors(mapped);
      }
      toast.error(apiErrorMessage(error, 'Password reset failed. The token may be invalid or expired.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Paste the reset token from your email and set a new password."
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          label="Reset token"
          htmlFor="reset-token"
          error={errors.token}
          required
          hint={tokenFromUrl ? 'Filled automatically from your reset link.' : undefined}
        >
          <Input
            id="reset-token"
            value={token}
            invalid={!!errors.token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </Field>

        <Field label="New password" htmlFor="reset-password" error={errors.new_password} required hint="At least 8 characters.">
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            value={password}
            invalid={!!errors.new_password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Field label="Confirm new password" htmlFor="reset-confirm" error={errors.new_password_confirm} required>
          <Input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            invalid={!!errors.new_password_confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
