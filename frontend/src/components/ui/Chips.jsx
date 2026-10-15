import { SLA_STATUS, TICKET_STATUS, PRIORITY, ROLE } from '../../utils/constants';
import { initials } from '../../utils/format';

/** Base chip — small, ring-bordered label. Always shows text (never color alone). */
export function Chip({ classes = 'bg-slate-100 text-slate-600 ring-slate-200', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${classes}`}
    >
      {children}
    </span>
  );
}

export function StatusChip({ status }) {
  const meta = TICKET_STATUS[status] || { label: status, classes: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return <Chip classes={meta.classes}>{meta.label}</Chip>;
}

export function SLAChip({ slaStatus }) {
  const meta = SLA_STATUS[slaStatus] || SLA_STATUS.NO_SLA;
  return (
    <Chip classes={meta.classes}>
      {(slaStatus === 'OVERDUE' || slaStatus === 'NEAR_SLA') && (
        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
      )}
      {meta.label}
    </Chip>
  );
}

export function PriorityChip({ priority }) {
  const meta = PRIORITY[priority] || { label: priority, classes: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return <Chip classes={meta.classes}>{meta.label}</Chip>;
}

export function RoleChip({ role }) {
  const meta = ROLE[role] || { label: role, classes: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return <Chip classes={meta.classes}>{meta.label}</Chip>;
}

export function Avatar({ name, className = '' }) {
  return (
    <span
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 ${className}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
