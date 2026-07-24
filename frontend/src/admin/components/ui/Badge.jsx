const variants = {
  success: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  warning: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  danger: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  info: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
  default: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
  purple: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200',
};

export default function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const map = {
    SUCCESS: { variant: 'success', label: 'Success' },
    FAILED: { variant: 'danger', label: 'Failed' },
    PENDING: { variant: 'warning', label: 'Pending' },
    REVERSED: { variant: 'info', label: 'Reversed' },
    ACTIVE: { variant: 'success', label: 'Active' },
    COMPLETED: { variant: 'info', label: 'Completed' },
    PAUSED: { variant: 'warning', label: 'Paused' },
    CANCELLED: { variant: 'danger', label: 'Cancelled' },
  };
  const { variant, label } = map[status] || { variant: 'default', label: status };
  return <Badge variant={variant}>{label}</Badge>;
}