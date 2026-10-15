/**
 * Form primitives with consistent labels, hints and error display.
 *
 * Control styling notes (kept in one place so every form matches):
 * - Fixed, comfortable height (h-10 ≈ 40px) with roomy horizontal padding.
 * - Real 1px borders instead of a flat ring, so fields read as inputs.
 * - Soft, outer brand glow on focus (no harsh inset ring) + a hover state.
 * - Selects get a custom chevron so they don't use the dated OS arrow.
 * - Textareas grow naturally with a sensible minimum height.
 */
import { ChevronDown } from 'lucide-react';

export function Field({ label, htmlFor, hint, error, required, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* Shared control shell: border + hover + soft focus glow + disabled/invalid. */
const BASE =
  'block w-full rounded-lg border bg-white text-sm text-slate-900 shadow-sm transition-colors duration-150 placeholder:text-slate-400 focus:outline-none';

const VALID = 'border-slate-300 hover:border-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15';
const INVALID = 'border-red-400 hover:border-red-500 focus:border-red-500 focus:ring-4 focus:ring-red-500/15';
const DISABLED = 'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:hover:border-slate-300';

const state = (invalid) => `${invalid ? INVALID : VALID} ${DISABLED}`;

/* Height + padding shared by single-line controls. */
const FIELD = 'h-10 px-3.5';

export function Input({ invalid, className = '', ...rest }) {
  return (
    <input
      className={`${BASE} ${FIELD} ${state(invalid)} ${className}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Select({ invalid, className = '', children, ...rest }) {
  return (
    <div className="relative">
      <select
        className={`${BASE} ${FIELD} appearance-none pr-9 ${state(invalid)} ${className}`}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
    </div>
  );
}

export function Textarea({ invalid, className = '', rows = 4, ...rest }) {
  return (
    <textarea
      rows={rows}
      className={`${BASE} min-h-24 resize-y px-3.5 py-2.5 leading-relaxed ${state(invalid)} ${className}`}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Checkbox({ label, id, className = '', ...rest }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <input
        id={id}
        type="checkbox"
        className="size-4 shrink-0 rounded border-slate-300 text-brand-600 accent-brand-600 focus:ring-brand-600 focus:ring-2 focus:ring-offset-1"
        {...rest}
      />
      <label htmlFor={id} className="text-sm text-slate-700 select-none">
        {label}
      </label>
    </div>
  );
}
