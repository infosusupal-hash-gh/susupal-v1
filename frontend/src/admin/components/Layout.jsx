import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import Header from './Header';
import { useQuery } from '@tanstack/react-query';
import adminApi from '../api/client';

function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ['unread-count'],
    queryFn: async () => {
      const { data } = await adminApi.get('/notifications?limit=1&unread_only=true');
      return data.unread_count || 0;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });
  return data || 0;
}

export default function Layout({ title, children }) {
  const { admin, loading } = useAdminAuth();
  const unreadCount = useUnreadCount();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" style={{ borderWidth: 3 }} />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!admin) return <Navigate to="/admin/login" replace />;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar unreadCount={unreadCount} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}