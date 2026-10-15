import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

export function Spinner({ className = '' }) {
  return (
    <svg className={`size-5 animate-spin text-brand-600 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function PageLoading({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner className="size-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Skeleton rows for tables/lists while data loads. */
export function SkeletonRows({ rows = 5, cols = 5 }) {
  return (
    <div className="space-y-3 py-1" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <div
              key={c}
              className="h-4 animate-pulse rounded bg-slate-100"
              style={{ flex: c === 1 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="rounded-full bg-slate-50 p-3 text-slate-400 ring-1 ring-slate-100">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-1 text-sm font-semibold text-slate-900">{title}</h3>
      {message && <p className="max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="rounded-full bg-red-50 p-3 text-red-500 ring-1 ring-red-100">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </span>
      <p className="max-w-sm text-sm text-slate-600">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-300 transition-colors hover:bg-slate-50"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
