import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AdminAuthProvider } from './context/AuthContext';

import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import UsersPage from './pages/Users';
import TransactionsPage from './pages/Transactions';
import ReconciliationPage from './pages/Reconciliation';
import PayoutsPage from './pages/Payouts';
import ProfitAnalyticsPage from './pages/ProfitAnalytics';
import ReportsPage from './pages/Reports';
import NotificationsPage from './pages/Notifications';
import ReminderCenter from './pages/ReminderCenter';
import SettingsPage from './pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { borderRadius: '12px', fontSize: '14px', fontFamily: 'Inter, sans-serif' },
            success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
          }}
        />
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="reconciliation" element={<ReconciliationPage />} />
          <Route path="payouts" element={<PayoutsPage />} />
          <Route path="profit" element={<ProfitAnalyticsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="reminders" element={<ReminderCenter />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </AdminAuthProvider>
    </QueryClientProvider>
  );
}