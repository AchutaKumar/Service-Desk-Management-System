/**
 * Display maps for ticket status, SLA state, priority and roles.
 * Chips always include a text label — color is never the only signal.
 * Class strings are complete literals so Tailwind can detect them.
 */

export const TICKET_STATUS = {
  OPEN: { label: 'Open', classes: 'bg-blue-50 text-blue-700 ring-blue-200' },
  ASSIGNED: { label: 'Assigned', classes: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  IN_PROGRESS: { label: 'In Progress', classes: 'bg-teal-50 text-teal-700 ring-teal-200' },
  WAITING_FOR_USER: { label: 'Waiting on User', classes: 'bg-amber-50 text-amber-800 ring-amber-200' },
  RESOLVED: { label: 'Resolved', classes: 'bg-green-50 text-green-700 ring-green-200' },
  CLOSED: { label: 'Closed', classes: 'bg-slate-100 text-slate-600 ring-slate-200' },
  REOPENED: { label: 'Reopened', classes: 'bg-orange-50 text-orange-700 ring-orange-200' },
};

export const SLA_STATUS = {
  OVERDUE: { label: 'Overdue', classes: 'bg-red-50 text-red-700 ring-red-200' },
  NEAR_SLA: { label: 'Near SLA', classes: 'bg-amber-50 text-amber-800 ring-amber-200' },
  WITHIN_SLA: { label: 'Within SLA', classes: 'bg-slate-50 text-slate-600 ring-slate-200' },
  RESOLVED_WITHIN_SLA: { label: 'Met SLA', classes: 'bg-green-50 text-green-700 ring-green-200' },
  RESOLVED_AFTER_SLA: { label: 'Missed SLA', classes: 'bg-orange-50 text-orange-700 ring-orange-200' },
  NO_SLA: { label: 'No SLA', classes: 'bg-slate-50 text-slate-500 ring-slate-200' },
};

export const PRIORITY = {
  LOW: { label: 'Low', classes: 'bg-slate-100 text-slate-600 ring-slate-200' },
  MEDIUM: { label: 'Medium', classes: 'bg-blue-50 text-blue-700 ring-blue-200' },
  HIGH: { label: 'High', classes: 'bg-orange-50 text-orange-700 ring-orange-200' },
  CRITICAL: { label: 'Critical', classes: 'bg-red-50 text-red-700 ring-red-200' },
};

export const ROLE = {
  EMPLOYEE: { label: 'Employee', classes: 'bg-slate-100 text-slate-700 ring-slate-200' },
  SUPPORT_AGENT: { label: 'Support Agent', classes: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  ADMIN: { label: 'Administrator', classes: 'bg-brand-50 text-brand-700 ring-brand-200' },
};

export const HISTORY_ACTION = {
  CREATED: 'Ticket created',
  STATUS_CHANGED: 'Status changed',
  ASSIGNED: 'Assigned',
  REASSIGNED: 'Reassigned',
  PRIORITY_CHANGED: 'Priority changed',
  COMMENT_ADDED: 'Comment added',
  ATTACHMENT_ADDED: 'Attachment added',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

/** Ticket status transitions enforced by the backend state machine. */
export const VALID_TRANSITIONS = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN'],
  IN_PROGRESS: ['WAITING_FOR_USER', 'RESOLVED'],
  WAITING_FOR_USER: ['IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  REOPENED: ['IN_PROGRESS', 'ASSIGNED'],
  CLOSED: [],
};

export const STATUS_OPTIONS = Object.entries(TICKET_STATUS).map(([value, { label }]) => ({
  value,
  label,
}));

export const PRIORITY_OPTIONS = Object.entries(PRIORITY).map(([value, { label }]) => ({
  value,
  label,
}));

export const ROLE_OPTIONS = Object.entries(ROLE).map(([value, { label }]) => ({
  value,
  label,
}));

export const REPORT_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

/** Chart palette derived from the brand system (ordered for contrast). */
export const CHART_COLORS = [
  '#2563eb', '#0f766e', '#7c3aed', '#b45309', '#dc2626',
  '#0891b2', '#4f46e5', '#65a30d', '#db2777', '#475569',
];
