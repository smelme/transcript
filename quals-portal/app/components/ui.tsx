export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  const value = (status || 'unknown').toLowerCase();
  const cls = value === 'active' || value === 'shared' ? 'ok' : value === 'revoked' ? 'err' : 'neutral';
  return <span className={`badge ${cls}`}>{status || 'unknown'}</span>;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortId(value?: string | null, length = 12): string {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
