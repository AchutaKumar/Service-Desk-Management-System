/** White panel with consistent border, radius and heading. */
export function Panel({ title, subtitle, actions, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-xs ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`px-5 py-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Compact metric tile used on dashboards. */
export function StatCard({ label, value, icon: Icon, tone = 'default', hint }) {
  const tones = {
    default: 'text-slate-900',
    info: 'text-brand-700',
    success: 'text-green-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className="rounded-lg bg-slate-50 p-1.5 text-slate-500 ring-1 ring-slate-100">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
