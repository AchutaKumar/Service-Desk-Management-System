import { useState } from 'react';
import toast from 'react-hot-toast';
import PageHeader from '../components/ui/PageHeader';
import { Panel } from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Field, Input } from '../components/ui/Form';
import { RoleChip, Avatar } from '../components/ui/Chips';
import { authApi } from '../api';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/format';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  const [profile, setProfile] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone: user?.phone || '',
  });
  const [profileBusy, setProfileBusy] = useState(false);

  const [pwd, setPwd] = useState({ old_password: '', new_password: '', new_password_confirm: '' });
  const [pwdErrors, setPwdErrors] = useState({});
  const [pwdBusy, setPwdBusy] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    setProfileBusy(true);
    try {
      await authApi.updateProfile({
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim(),
        phone: profile.phone.trim() || null,
      });
      await refreshUser();
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    const next = {};
    if (!pwd.new_password || pwd.new_password.length < 8) next.new_password = 'Use at least 8 characters.';
    if (pwd.new_password !== pwd.new_password_confirm)
      next.new_password_confirm = 'Passwords do not match.';
    setPwdErrors(next);
    if (Object.keys(next).length) return;

    setPwdBusy(true);
    try {
      await authApi.changePassword(pwd);
      setPwd({ old_password: '', new_password: '', new_password_confirm: '' });
      toast.success('Password changed.');
    } catch (err) {
      const data = err?.response?.data?.errors;
      if (data && typeof data === 'object') {
        const mapped = {};
        for (const [key, value] of Object.entries(data)) {
          mapped[key] = Array.isArray(value) ? value.join(' ') : String(value);
        }
        setPwdErrors(mapped);
      }
      toast.error(apiErrorMessage(err, 'Password change failed.'));
    } finally {
      setPwdBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="My profile" description="Your account details and password." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Identity card */}
        <Panel className="h-fit">
          <div className="flex items-center gap-3.5">
            <Avatar name={user?.full_name} className="size-12 text-base" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900">{user?.full_name}</p>
              <p className="truncate text-sm text-slate-500">{user?.email}</p>
              <div className="mt-1.5"><RoleChip role={user?.role} /></div>
            </div>
          </div>
          <dl className="mt-5 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
            {[
              ['Username', user?.username],
              ['Department', user?.department_name || '—'],
              ['Phone', user?.phone || '—'],
              ['Member since', formatDate(user?.date_joined)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <div className="space-y-5 lg:col-span-2">
          <Panel title="Personal details">
            <form onSubmit={saveProfile} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="pf-first" required>
                <Input
                  id="pf-first"
                  value={profile.first_name}
                  onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))}
                />
              </Field>
              <Field label="Last name" htmlFor="pf-last" required>
                <Input
                  id="pf-last"
                  value={profile.last_name}
                  onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))}
                />
              </Field>
              <Field label="Phone" htmlFor="pf-phone">
                <Input
                  id="pf-phone"
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                />
              </Field>
              <div className="flex items-end sm:col-span-2">
                <Button type="submit" loading={profileBusy}>Save changes</Button>
              </div>
            </form>
          </Panel>

          <Panel title="Change password" subtitle="Your password is hashed with strong one-way encryption.">
            <form onSubmit={changePassword} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Current password" htmlFor="pwd-old" error={pwdErrors.old_password} required>
                <Input
                  id="pwd-old"
                  type="password"
                  autoComplete="current-password"
                  value={pwd.old_password}
                  invalid={!!pwdErrors.old_password}
                  onChange={(e) => setPwd((p) => ({ ...p, old_password: e.target.value }))}
                />
              </Field>
              <Field label="New password" htmlFor="pwd-new" error={pwdErrors.new_password} required hint="Min. 8 characters.">
                <Input
                  id="pwd-new"
                  type="password"
                  autoComplete="new-password"
                  value={pwd.new_password}
                  invalid={!!pwdErrors.new_password}
                  onChange={(e) => setPwd((p) => ({ ...p, new_password: e.target.value }))}
                />
              </Field>
              <Field label="Confirm new" htmlFor="pwd-confirm" error={pwdErrors.new_password_confirm} required>
                <Input
                  id="pwd-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={pwd.new_password_confirm}
                  invalid={!!pwdErrors.new_password_confirm}
                  onChange={(e) => setPwd((p) => ({ ...p, new_password_confirm: e.target.value }))}
                />
              </Field>
              <div className="sm:col-span-3">
                <Button type="submit" loading={pwdBusy} variant="secondary">
                  Update password
                </Button>
              </div>
            </form>
          </Panel>
        </div>
      </div>
    </>
  );
}
