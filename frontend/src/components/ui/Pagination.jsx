import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Pagination bar. Expects the backend's paginated envelope:
 * { count, total_pages, current_page, next, previous }.
 */
export default function Pagination({ meta, onPageChange }) {
  if (!meta || (meta.total_pages <= 1 && !meta.count)) return null;

  const { current_page: page, total_pages: pages, count } = meta;
  if (!pages || pages <= 1) {
    return (
      <p className="px-1 pt-3 text-xs text-slate-500">
        {count} {count === 1 ? 'result' : 'results'}
      </p>
    );
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3" aria-label="Pagination">
      <p className="text-xs text-slate-500 tabular-nums">
        Page {page} of {pages} · {count} results
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          Next
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
