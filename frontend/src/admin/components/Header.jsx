import { Bell, X, CheckCheck } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import adminApi from '../api/client';
import { useAdminAuth } from '../context/AuthContext';

const typeColors = {
  FAILED_PAYOUT: 'bg-red-100 text-red-700',
  FAILED_PAYMENT: 'bg-red-100 text-red-700',
  LIQUIDITY_WARNING: 'bg-amber-100 text-amber-700',
  HIGH_WITHDRAWAL: 'bg-orange-100 text-orange-700',
  SUSPICIOUS_ACTIVITY: 'bg-red-100 text-red-700',
  NEW_REGISTRATION: 'bg-emerald-100 text-emerald-700',
  SYSTEM: 'bg-blue-100 text-blue-700',
};

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['notifications-preview'],
    queryFn: async () => {
      const { data } = await adminApi.get('/notifications?limit=8&unread_only=false');
      return data;
    },
    refetchInterval: 30000,
  });

  const markAllRead = useMutation({
    mutationFn: () => adminApi.put('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries(['notifications-preview']),
  });

  const markRead = useMutation({
    mutationFn: (id) => adminApi.put(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries(['notifications-preview']),
  });

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = data?.unread_count || 0;
  const notifications = data?.data || [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <span className="font-semibold text-sm text-gray-900">Notifications</span>
              {unread > 0 && (
                <span className="ml-2 text-xs bg-red-100 text-red-600 rounded-full px-1.5 py-0.5 font-medium">{unread} new</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => { if (!n.is_read) markRead.mutate(n.id); }}
                  className={`px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition ${!n.is_read ? 'bg-emerald-50/50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${typeColors[n.type] || 'bg-gray-100 text-gray-600'}`}>
                      {n.type?.replace(/_/g, ' ')}
                    </span>
                    {!n.is_read && <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0 mt-1.5 ml-auto" />}
                  </div>
                  <p className="text-sm text-gray-800 font-medium mt-1">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              ))
            )}
          </div>

          <button
            onClick={() => { navigate('/admin/notifications'); setOpen(false); }}
            className="w-full text-center py-2.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium border-t border-gray-100 hover:bg-gray-50 transition"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ title }) {
  const { admin } = useAdminAuth();

  return (
    <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="text-xs text-gray-400">
          {new Date().toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">
              {admin?.name?.charAt(0)?.toUpperCase() || 'A'}
            </span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-800 leading-none">{admin?.name}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{admin?.role?.replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </header>
  );
}