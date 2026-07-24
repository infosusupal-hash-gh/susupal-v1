import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import adminApi from '../api/client';
import Layout from '../components/Layout';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';

const typeConfig = {
  FAILED_PAYOUT: { variant: 'danger', label: 'Failed Payout', icon: '💸' },
  FAILED_PAYMENT: { variant: 'danger', label: 'Failed Payment', icon: '❌' },
  HIGH_WITHDRAWAL: { variant: 'warning', label: 'High Withdrawal', icon: '📤' },
  LIQUIDITY_WARNING: { variant: 'warning', label: 'Liquidity Warning', icon: '⚠️' },
  SUSPICIOUS_ACTIVITY: { variant: 'danger', label: 'Suspicious Activity', icon: '🚨' },
  NEW_REGISTRATION: { variant: 'success', label: 'New Registration', icon: '👤' },
  SYSTEM: { variant: 'info', label: 'System', icon: '🔧' },
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-page', page, unreadOnly],
    queryFn: async () => {
      const { data } = await adminApi.get('/notifications', {
        params: { page, limit: 20, unread_only: unreadOnly },
      });
      return data;
    },
    keepPreviousData: true,
    refetchInterval: 30000,
  });

  const markRead = useMutation({
    mutationFn: (id) => adminApi.put(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries(['notifications-page']),
  });

  const markAllRead = useMutation({
    mutationFn: () => adminApi.put('/notifications/read-all'),
    onSuccess: () => { toast.success('All notifications marked as read'); qc.invalidateQueries(['notifications-page']); },
  });

  const notifications = data?.data || [];
  const unreadCount = data?.unread_count || 0;

  return (
    <Layout title="Notification Center">
      <div className="max-w-[900px] mx-auto space-y-5">
        {/* Header */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Bell className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Notifications</h2>
              {unreadCount > 0 && (
                <p className="text-xs text-emerald-600 font-medium">{unreadCount} unread</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }}
                className="w-4 h-4 rounded accent-emerald-600" />
              Unread only
            </label>
            {unreadCount > 0 && (
              <button onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs font-medium transition">
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-48" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-24" />
                  </div>
                </div>
              </div>
            ))
          ) : notifications.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Bell className="w-8 h-8 text-gray-300" />
              </div>
              <p className="font-semibold text-gray-500">No notifications</p>
              <p className="text-sm text-gray-400 mt-1">You're all caught up!</p>
            </div>
          ) : (
            notifications.map((n) => {
              const config = typeConfig[n.type] || { variant: 'default', label: n.type, icon: '🔔' };
              return (
                <div
                  key={n.id}
                  className={`bg-white rounded-2xl p-4 border transition-all ${!n.is_read ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-100'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge variant={config.variant}>{config.label}</Badge>
                          <p className="font-semibold text-gray-900 mt-1">{n.title}</p>
                        </div>
                        {!n.is_read && (
                          <button
                            onClick={() => markRead.mutate(n.id)}
                            className="flex-shrink-0 p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition"
                            title="Mark as read"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.is_read && <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0 mt-1.5" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {data && (
          <Pagination
            page={page}
            pages={Math.ceil((data.total || 0) / 20)}
            total={data.total || 0}
            limit={20}
            onChange={setPage}
          />
        )}
      </div>
    </Layout>
  );
}