import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ChevronLeft, Paperclip, Send, Trash2, PencilLine, History as HistoryIcon,
  FileText, MessageSquare, UserPlus, CheckCircle2, Clock,
} from 'lucide-react';
import { Panel } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Textarea, Select } from '../../components/ui/Form';
import { PageLoading, ErrorState, EmptyState, Spinner } from '../../components/ui/States';
import Modal, { ConfirmDialog } from '../../components/ui/Modal';
import { StatusChip, SLAChip, PriorityChip, Avatar } from '../../components/ui/Chips';
import { ticketsApi, usersApi } from '../../api';
import { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { VALID_TRANSITIONS, HISTORY_ACTION } from '../../utils/constants';
import { formatDateTime, relativeTime, timeUntil, formatBytes } from '../../utils/format';

const TRANSITION_LABELS = {
  ASSIGNED: 'Assign to agent',
  IN_PROGRESS: 'Start progress',
  WAITING_FOR_USER: 'Waiting on user',
  RESOLVED: 'Mark resolved',
  CLOSED: 'Close ticket',
  REOPENED: 'Reopen ticket',
  OPEN: 'Return to open',
};

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, isAgent } = useAuth();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const [comment, setComment] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [editingComment, setEditingComment] = useState(null); // { id, content }
  const [deleteComment, setDeleteComment] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [agents, setAgents] = useState([]);
  const [assignTarget, setAssignTarget] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await ticketsApi.get(id);
      setTicket(data.data);
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? 'You do not have permission to view this ticket.'
          : apiErrorMessage(err, 'Could not load the ticket.')
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Permission helpers (mirroring backend rules) ─────────────────────
  const isOwner = ticket?.created_by?.id === user?.id;
  const isAssignedAgent = ticket?.assigned_to?.id === user?.id;
  const canManageStatus = isAdmin || (isAgent && isAssignedAgent);
  const canCloseReopen = isAdmin || isOwner;
  const canComment = ticket && ticket.status !== 'CLOSED' && (isAdmin || isOwner || isAssignedAgent);
  const closed = ticket?.status === 'CLOSED';

  // ── Actions ──────────────────────────────────────────────────────────
  async function runAction(label, fn) {
    setActionBusy(true);
    try {
      const { data } = await fn();
      toast.success(data.message || label);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }

  const changeStatus = (status) => () =>
    runAction('Status updated.', () => ticketsApi.changeStatus(ticket.id, status));

  async function openAssign() {
    setAssignOpen(true);
    if (!agents.length) {
      try {
        const { data } = await usersApi.agents();
        setAgents(data.data || []);
      } catch (err) {
        toast.error(apiErrorMessage(err));
      }
    }
  }

  async function submitAssign() {
    if (!assignTarget) return;
    await runAction('Ticket assigned.', () => ticketsApi.assign(ticket.id, Number(assignTarget)));
    setAssignOpen(false);
  }

  async function confirmDelete() {
    setActionBusy(true);
    try {
      await ticketsApi.remove(ticket.id);
      toast.success('Ticket deleted.');
      navigate('/tickets');
    } catch (err) {
      toast.error(apiErrorMessage(err));
      setActionBusy(false);
    }
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    setCommentBusy(true);
    try {
      await ticketsApi.addComment(ticket.id, comment.trim());
      setComment('');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setCommentBusy(false);
    }
  }

  async function saveEditedComment() {
    if (!editingComment?.content.trim()) return;
    try {
      await ticketsApi.updateComment(ticket.id, editingComment.id, editingComment.content.trim());
      setEditingComment(null);
      toast.success('Comment updated.');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function confirmDeleteComment() {
    try {
      await ticketsApi.deleteComment(ticket.id, deleteComment.id);
      setDeleteComment(null);
      toast.success('Comment deleted.');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onFileSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      await ticketsApi.uploadAttachment(ticket.id, file, (evt) => {
        if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      toast.success('File uploaded.');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Upload failed. Check the file type and size (max 10 MB).'));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  if (loading) return <PageLoading label="Loading ticket…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!ticket) return <ErrorState message="Ticket not found." />;

  // Valid next transitions for the current status, respecting role rules
  const nextStatuses = (VALID_TRANSITIONS[ticket.status] || []).filter((s) => {
    if (s === 'ASSIGNED') return false; // assignment goes through the assign modal
    if (s === 'CLOSED' || s === 'REOPENED') return false; // rendered separately below
    return canManageStatus;
  });
  const showClose = canCloseReopen && ticket.status === 'RESOLVED';
  const showReopen = canCloseReopen && ticket.status === 'RESOLVED';

  return (
    <>
      <Link
        to="/tickets"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to tickets
      </Link>

      {/* Header */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 tabular-nums">{ticket.ticket_id}</span>
              <StatusChip status={ticket.status} />
              <PriorityChip priority={ticket.priority?.name} />
              <SLAChip slaStatus={ticket.sla_status} />
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{ticket.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Opened by {ticket.created_by?.full_name} · {formatDateTime(ticket.created_at)}
              {ticket.due_at && !['RESOLVED', 'CLOSED'].includes(ticket.status) && (
                <span className="ml-2 inline-flex items-center gap-1 font-medium text-slate-600">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {timeUntil(ticket.due_at)}
                </span>
              )}
            </p>
          </div>

          {/* Action cluster */}
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && !closed && (
              <Button variant="secondary" size="sm" onClick={openAssign}>
                <UserPlus className="size-4" aria-hidden="true" />
                {ticket.assigned_to ? 'Reassign' : 'Assign'}
              </Button>
            )}
            {nextStatuses.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'RESOLVED' ? 'primary' : 'secondary'}
                loading={actionBusy}
                onClick={changeStatus(s)}
              >
                {s === 'RESOLVED' && <CheckCircle2 className="size-4" aria-hidden="true" />}
                {TRANSITION_LABELS[s]}
              </Button>
            ))}
            {showClose && (
              <Button size="sm" loading={actionBusy} onClick={() => runAction('Ticket closed.', () => ticketsApi.close(ticket.id))}>
                Close ticket
              </Button>
            )}
            {showReopen && (
              <Button size="sm" variant="secondary" loading={actionBusy} onClick={() => runAction('Ticket reopened.', () => ticketsApi.reopen(ticket.id))}>
                Reopen
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="dangerGhost" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          <Panel title="Description">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
              {ticket.description}
            </p>
          </Panel>

          {/* Attachments */}
          <Panel
            title={`Attachments (${ticket.attachments?.length || 0})`}
            actions={
              canComment ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={onFileSelected}
                    accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="size-4" aria-hidden="true" />
                    {uploading ? `Uploading ${uploadProgress}%` : 'Upload file'}
                  </Button>
                </>
              ) : null
            }
          >
            {ticket.attachments?.length ? (
              <ul className="divide-y divide-slate-100">
                {ticket.attachments.map((att) => (
                  <li key={att.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="rounded-lg bg-slate-50 p-2 text-slate-500 ring-1 ring-slate-100">
                        <FileText className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <a
                          href={att.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-medium text-slate-800 hover:text-brand-600"
                        >
                          {att.original_filename}
                        </a>
                        <p className="text-xs text-slate-400">
                          {formatBytes(att.file_size)} · uploaded by {att.uploaded_by?.full_name} · {relativeTime(att.created_at)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-slate-500">
                No attachments. Screenshots and log files help agents resolve faster.
              </p>
            )}
          </Panel>

          {/* Comments */}
          <Panel title={`Conversation (${ticket.comments?.length || 0})`}>
            <ul className="space-y-4">
              {ticket.comments?.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <Avatar name={c.user?.full_name} />
                  <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        {c.user?.full_name}
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          {c.user?.role === 'SUPPORT_AGENT' ? 'Support' : c.user?.role === 'ADMIN' ? 'Admin' : ''}
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{relativeTime(c.created_at)}</span>
                        {c.is_own_comment && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingComment({ id: c.id, content: c.content })}
                              className="text-slate-400 transition-colors hover:text-brand-600"
                              aria-label="Edit comment"
                            >
                              <PencilLine className="size-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteComment(c)}
                              className="text-slate-400 transition-colors hover:text-red-600"
                              aria-label="Delete comment"
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {editingComment?.id === c.id ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          rows={3}
                          value={editingComment.content}
                          onChange={(e) => setEditingComment((v) => ({ ...v, content: e.target.value }))}
                          aria-label="Edit comment text"
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setEditingComment(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={saveEditedComment}>Save</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                        {c.content}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {canComment ? (
              <form onSubmit={submitComment} className="mt-5 border-t border-slate-100 pt-4">
                <Textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write a reply…"
                  aria-label="Add a comment"
                />
                <div className="mt-2 flex justify-end">
                  <Button type="submit" size="sm" loading={commentBusy} disabled={!comment.trim()}>
                    <Send className="size-4" aria-hidden="true" />
                    Send
                  </Button>
                </div>
              </form>
            ) : (
              <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
                {closed
                  ? 'This ticket is closed — the conversation is read-only.'
                  : 'You can view but not comment on this ticket.'}
              </p>
            )}
          </Panel>
        </div>

        {/* Side column */}
        <div className="space-y-5">
          <Panel title="Details">
            <dl className="space-y-3 text-sm">
              {[
                ['Category', ticket.category?.name],
                ['Subcategory', ticket.subcategory?.name],
                ['Priority', ticket.priority ? `${ticket.priority.name} · ${ticket.priority.sla_hours}h SLA` : null],
                ['Department', ticket.department?.name],
                ['Assigned to', ticket.assigned_to?.full_name || 'Unassigned'],
                ['Created', formatDateTime(ticket.created_at)],
                ['Due by', ticket.due_at ? `${formatDateTime(ticket.due_at)}` : null],
                ['Resolved', ticket.resolved_at ? formatDateTime(ticket.resolved_at) : null],
                ['Closed', ticket.closed_at ? formatDateTime(ticket.closed_at) : null],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-slate-500">{k}</dt>
                    <dd className="text-right font-medium text-slate-800">{v}</dd>
                  </div>
                ))}
            </dl>
          </Panel>

          <Panel title="History" bodyClassName="px-5 py-4">
            <ol className="relative space-y-4 border-l border-slate-200 pl-4">
              {[...(ticket.history || [])].reverse().map((h) => (
                <li key={h.id} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-brand-400 ring-4 ring-white"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-slate-800">
                    {HISTORY_ACTION[h.action] || h.action}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    {h.description ||
                      [h.old_value && `from ${h.old_value}`, h.new_value && `to ${h.new_value}`]
                        .filter(Boolean)
                        .join(' → ')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {h.changed_by ? `${h.changed_by.full_name} · ` : 'System · '}
                    {formatDateTime(h.created_at)}
                  </p>
                </li>
              ))}
              {(!ticket.history || ticket.history.length === 0) && (
                <li className="text-sm text-slate-500">No activity recorded yet.</li>
              )}
            </ol>
          </Panel>
        </div>
      </div>

      {/* Assign modal (admin) */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={ticket.assigned_to ? 'Reassign ticket' : 'Assign ticket'}
        description="Pick the support agent who should own this request."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button loading={actionBusy} onClick={submitAssign} disabled={!assignTarget}>
              Assign
            </Button>
          </>
        }
      >
        <label htmlFor="assign-agent" className="mb-1.5 block text-sm font-medium text-slate-700">
          Support agent
        </label>
        <Select
          id="assign-agent"
          value={assignTarget}
          onChange={(e) => setAssignTarget(e.target.value)}
        >
          <option value="">Choose an agent…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.full_name} ({a.email})</option>
          ))}
        </Select>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        loading={actionBusy}
        danger
        title="Delete this ticket?"
        message={`${ticket.ticket_id} and all its comments, attachments and history will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete ticket"
      />

      {/* Delete comment confirmation */}
      <ConfirmDialog
        open={!!deleteComment}
        onClose={() => setDeleteComment(null)}
        onConfirm={confirmDeleteComment}
        danger
        title="Delete comment?"
        message="This comment will be permanently removed."
        confirmLabel="Delete"
      />
    </>
  );
}
