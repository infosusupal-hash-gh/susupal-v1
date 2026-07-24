import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Lock, Mail, Settings2, Monitor, LogOut, Save, Eye, EyeOff, Loader2, Laptop } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import adminApi from '../api/client';
import Layout from '../components/Layout';
import { useAdminAuth } from '../context/AuthContext';

function SectionCard({ icon: Icon, title, description, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
          <Icon className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { admin } = useAdminAuth();

  const { data: platform } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => { const { data } = await adminApi.get('/settings/platform'); return data; },
  });

  const { data: sessions } = useQuery({
    queryKey: ['admin-sessions'],
    queryFn: async () => { const { data } = await adminApi.get('/settings/sessions'); return data; },
  });

  // Profile form
  const [profile, setProfile] = useState({ name: '', phone: '' });
  useEffect(() => { if (admin) setProfile({ name: admin.name || '', phone: admin.phone || '' }); }, [admin]);

  // Password form
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });

  // Email form
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });

  // Platform form
  const [plat, setPlat] = useState({ platform_name: '', commission_days: '', max_retry_attempts: '', grace_period_days: '', timezone: '' });
  useEffect(() => { if (platform) setPlat({ platform_name: platform.platform_name || '', commission_days: platform.commission_days || '', max_retry_attempts: platform.max_retry_attempts || '', grace_period_days: platform.grace_period_days || '', timezone: platform.timezone || '' }); }, [platform]);

  const profileMutation = useMutation({
    mutationFn: (data) => adminApi.put('/settings/profile', data),
    onSuccess: () => { toast.success('Profile updated'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const emailMutation = useMutation({
    mutationFn: (data) => adminApi.put('/settings/change-email', data),
    onSuccess: () => { toast.success('Email updated successfully'); setEmailForm({ email: '', password: '' }); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const pwMutation = useMutation({
    mutationFn: (data) => adminApi.put('/settings/change-password', data),
    onSuccess: () => { toast.success('Password changed successfully'); setPwForm({ current_password: '', new_password: '', confirm: '' }); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const platMutation = useMutation({
    mutationFn: (data) => adminApi.put('/settings/platform', data),
    onSuccess: () => { toast.success('Platform settings saved'); qc.invalidateQueries(['platform-settings']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const logoutAllMutation = useMutation({
    mutationFn: () => adminApi.delete('/settings/sessions/all'),
    onSuccess: () => { toast.success('All sessions terminated'); qc.invalidateQueries(['admin-sessions']); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const handlePwSubmit = (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    if (pwForm.new_password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    pwMutation.mutate({ current_password: pwForm.current_password, new_password: pwForm.new_password });
  };

  return (
    <Layout title="Settings">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Admin Info Banner */}
        {admin && (
          <div className="bg-gradient-to-r from-[#064e3b] to-[#059669] rounded-2xl p-5 text-white flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0">
              {admin.name?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <p className="text-xl font-bold">{admin.name}</p>
              <p className="text-emerald-200 text-sm">{admin.email}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">{admin.role?.replace('_', ' ')}</span>
                {admin.last_login && (
                  <span className="text-xs text-emerald-200">
                    Last login: {formatDistanceToNow(new Date(admin.last_login), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Profile */}
        <SectionCard icon={User} title="Profile Information" description="Update your name and phone number">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name">
              <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className={inputClass} placeholder="Your name" />
            </Field>
            <Field label="Phone Number">
              <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className={inputClass} placeholder="0550000000" />
            </Field>
          </div>
          <button
            onClick={() => profileMutation.mutate(profile)}
            disabled={profileMutation.isLoading}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#059669] text-white rounded-xl text-sm font-medium hover:bg-[#047857] transition disabled:opacity-60"
          >
            {profileMutation.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Profile
          </button>
        </SectionCard>

        {/* Change Email */}
        <SectionCard icon={Mail} title="Change Email" description="Update your admin login email address">
          <form onSubmit={(e) => { e.preventDefault(); emailMutation.mutate(emailForm); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="New Email">
                <input type="email" value={emailForm.email} onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })} className={inputClass} placeholder="new@email.com" required />
              </Field>
              <Field label="Confirm with Password">
                <input type="password" value={emailForm.password} onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })} className={inputClass} placeholder="Your current password" required />
              </Field>
            </div>
            <button type="submit" disabled={emailMutation.isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-[#059669] text-white rounded-xl text-sm font-medium hover:bg-[#047857] transition disabled:opacity-60">
              {emailMutation.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Update Email
            </button>
          </form>
        </SectionCard>

        {/* Change Password */}
        <SectionCard icon={Lock} title="Change Password" description="Use a strong password of at least 8 characters">
          <form onSubmit={handlePwSubmit} className="space-y-4">
            {[
              { key: 'current_password', label: 'Current Password', showKey: 'current' },
              { key: 'new_password', label: 'New Password', showKey: 'new' },
              { key: 'confirm', label: 'Confirm New Password', showKey: 'confirm' },
            ].map(({ key, label, showKey }) => (
              <Field key={key} label={label}>
                <div className="relative">
                  <input
                    type={showPw[showKey] ? 'text' : 'password'}
                    value={pwForm[key]}
                    onChange={(e) => setPwForm({ ...pwForm, [key]: e.target.value })}
                    className={inputClass + ' pr-10'}
                    placeholder="••••••••"
                    required
                  />
                  <button type="button"
                    onClick={() => setShowPw({ ...showPw, [showKey]: !showPw[showKey] })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPw[showKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
            ))}
            <button type="submit" disabled={pwMutation.isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-[#059669] text-white rounded-xl text-sm font-medium hover:bg-[#047857] transition disabled:opacity-60">
              {pwMutation.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Change Password
            </button>
          </form>
        </SectionCard>

        {/* Platform Settings */}
        {admin?.role === 'SUPER_ADMIN' && (
          <SectionCard icon={Settings2} title="Platform Configuration" description="Global platform settings (Super Admin only)">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Platform Name">
                <input value={plat.platform_name} onChange={(e) => setPlat({ ...plat, platform_name: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Commission Days">
                <input type="number" value={plat.commission_days} onChange={(e) => setPlat({ ...plat, commission_days: e.target.value })} className={inputClass} min="1" max="10" />
              </Field>
              <Field label="Max Retry Attempts">
                <input type="number" value={plat.max_retry_attempts} onChange={(e) => setPlat({ ...plat, max_retry_attempts: e.target.value })} className={inputClass} min="1" max="10" />
              </Field>
              <Field label="Grace Period (days)">
                <input type="number" value={plat.grace_period_days} onChange={(e) => setPlat({ ...plat, grace_period_days: e.target.value })} className={inputClass} min="0" max="14" />
              </Field>
              <Field label="Timezone">
                <select value={plat.timezone} onChange={(e) => setPlat({ ...plat, timezone: e.target.value })} className={inputClass}>
                  <option value="Africa/Accra">Africa/Accra (GMT+0)</option>
                  <option value="Africa/Lagos">Africa/Lagos (GMT+1)</option>
                  <option value="UTC">UTC</option>
                </select>
              </Field>
            </div>
            <button onClick={() => platMutation.mutate(plat)} disabled={platMutation.isLoading}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#059669] text-white rounded-xl text-sm font-medium hover:bg-[#047857] transition disabled:opacity-60">
              {platMutation.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Platform Settings
            </button>
          </SectionCard>
        )}

        {/* Active Sessions */}
        <SectionCard icon={Monitor} title="Active Sessions" description="Devices currently signed in to your admin account">
          <div className="space-y-2 mb-4">
            {!sessions?.length ? (
              <p className="text-sm text-gray-400 py-2">No active sessions found</p>
            ) : (
              sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <Laptop className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{s.user_agent || 'Unknown device'}</p>
                    <p className="text-xs text-gray-400">{s.ip_address || 'Unknown IP'} — {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <button
            onClick={() => logoutAllMutation.mutate()}
            disabled={logoutAllMutation.isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition disabled:opacity-60"
          >
            {logoutAllMutation.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            Logout from all devices
          </button>
        </SectionCard>

      </div>
    </Layout>
  );
}