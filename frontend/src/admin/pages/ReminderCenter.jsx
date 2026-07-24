import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, RefreshCcw, Search, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import adminApi from '../api/client';
import Layout from '../components/Layout';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';

function StatCard({ title, value, subtitle }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-2">{subtitle}</p>}
    </div>
  );
}

export default function ReminderCenter() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const summaryQuery = useQuery({
    queryKey: ['reminder-summary'],
    queryFn: async () => await adminApi.get('/reminders/summary').then((res) => res.data),
  });

  const logsQuery = useQuery({
    queryKey: ['reminder-logs', page, search],
    queryFn: async () => await adminApi.get('/reminders', { params: { page, limit: 20, search } }).then((res) => res.data),
    keepPreviousData: true,
  });

  const resendMutation = useMutation({
    mutationFn: (id) => adminApi.post(`/reminders/${id}/resend`),
    onSuccess: () => {
      toast.success('Reminder requeued successfully');
      qc.invalidateQueries(['reminder-logs', page, search]);
      qc.invalidateQueries(['reminder-summary']);
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Unable to resend reminder');
    },
  });

  const summary = summaryQuery.data || {};
  const logs = logsQuery.data?.logs || [];
  const total = logsQuery.data?.total || 0;
  const pages = logsQuery.data?.pages || 1;

  return (
    <Layout title="Reminder Center">
      <div className="max-w-[1100px] mx-auto space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Reminders sent today" value={summary.total_reminders_sent_today ?? 0} />
          <StatCard title="Failed SMS" value={summary.failed_sms_count ?? 0} />
          <StatCard title="Pending SMS" value={summary.pending_sms_count ?? 0} />
          <StatCard title="Logs today" value={summary.reminders_created_today ?? 0} />
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Reminder logs</h2>
              <p className="text-sm text-gray-500">View delivery status, search by user, and resend reminders.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative text-gray-400 focus-within:text-gray-500">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="pl-10 pr-3 py-2 border border-gray-200 rounded-2xl text-sm w-full sm:w-72"
                  placeholder="Search by name or phone"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <button
                type="button"
                onClick={() => qc.invalidateQueries(['reminder-logs', page, search])}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-sm font-medium"
              >
                <RefreshCcw className="w-4 h-4" /> Refresh
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">No reminder logs found.</td>
                  </tr>
                ) : (
                  logs.map((reminder) => (
                    <tr key={reminder.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-gray-900">{reminder.user?.name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">{reminder.user?.phone}</div>
                      </td>
                      <td className="px-4 py-4 uppercase text-xs font-semibold text-gray-600">{reminder.type.replaceAll('_', ' ')}</td>
                      <td className="px-4 py-4 text-sm text-gray-700 max-w-xl truncate">{reminder.message}</td>
                      <td className="px-4 py-4">
                        <Badge variant={reminder.delivery_status === 'SENT' ? 'success' : reminder.delivery_status === 'FAILED' ? 'danger' : 'default'}>
                          {reminder.delivery_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{reminder.sent_at ? new Date(reminder.sent_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          disabled={resendMutation.isLoading}
                          onClick={() => resendMutation.mutate(reminder.id)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                        >
                          <ArrowRight className="w-4 h-4" /> Resend
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <Pagination page={page} pages={pages} total={total} limit={20} onChange={setPage} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
