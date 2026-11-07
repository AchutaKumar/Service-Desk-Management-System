import { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Send, Trash2, PencilLine, Wifi, WifiOff, MessageSquare, ChevronDown, Check
} from 'lucide-react';
import { Panel } from '../ui/Card';
import Button from '../ui/Button';
import { Textarea } from '../ui/Form';
import { Avatar } from '../ui/Chips';
import { ConfirmDialog } from '../ui/Modal';
import { useTicketChat } from '../../hooks/useTicketChat';
import { relativeTime, formatDateTime } from '../../utils/format';

export default function TicketChat({
  ticket,
  currentUser,
  canComment,
  onTicketStatusChange,
}) {
  const {
    comments,
    connectionStatus,
    typingUsers,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    reconnect,
  } = useTicketChat(ticket.id, ticket.comments, onTicketStatusChange);

  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingComment, setEditingComment] = useState(null); // { id, content }
  const [deleteCommentTarget, setDeleteCommentTarget] = useState(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const typingTimerRef = useRef(null);
  const prevCommentsLengthRef = useRef(comments?.length || 0);

  // Auto-scroll to bottom on mount and when new messages arrive
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end',
      });
    }
  }, []);

  // Track scroll position to show/hide "jump to latest" button
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distanceToBottom > 120);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    const hadNewMessage = (comments?.length || 0) > prevCommentsLengthRef.current;
    prevCommentsLengthRef.current = comments?.length || 0;

    // Always scroll down if the user is already near the bottom or on initial load
    if (isNearBottom || hadNewMessage) {
      scrollToBottom(true);
    }
  }, [comments, scrollToBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // Handle typing debounce
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    if (val.trim()) {
      sendTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        sendTyping(false);
      }, 1500);
    } else {
      sendTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      sendTyping(false);
      await sendMessage(text);
      setInputText('');
      setTimeout(() => scrollToBottom(true), 50);
    } catch {
      toast.error('Could not send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingComment?.content.trim()) return;
    try {
      await editMessage(editingComment.id, editingComment.content.trim());
      setEditingComment(null);
      toast.success('Message updated.');
    } catch {
      toast.error('Failed to update message.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteCommentTarget) return;
    try {
      await deleteMessage(deleteCommentTarget.id);
      setDeleteCommentTarget(null);
      toast.success('Message deleted.');
    } catch {
      toast.error('Failed to delete message.');
    }
  };

  const closed = ticket.status === 'CLOSED';

  // Render connection badge
  const renderConnectionBadge = () => {
    if (connectionStatus === 'connected') {
      return (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20"
          title="WebSocket connected: real-time updates active"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
          </span>
          Live
        </span>
      );
    }

    if (connectionStatus === 'connecting') {
      return (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20"
          title="Connecting to real-time chat server…"
        >
          <span className="size-2 rounded-full bg-amber-400 animate-pulse"></span>
          Connecting…
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={reconnect}
        className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-600/20 hover:bg-rose-100 transition-colors"
        title="Offline. Click to reconnect."
      >
        <WifiOff className="size-3 text-rose-600" />
        Offline · Reconnect
      </button>
    );
  };

  return (
    <>
      <Panel
        title={`Live Conversation (${comments?.length || 0})`}
        actions={renderConnectionBadge()}
      >
        {/* Chat message stream container */}
        <div className="relative">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex max-h-[500px] min-h-[260px] flex-col gap-3.5 overflow-y-auto px-1 py-2 pr-2"
          >
            {comments && comments.length > 0 ? (
              comments.map((c) => {
                const isOwn = c.user?.id === currentUser?.id || c.is_own_comment;
                const isAgent = c.user?.role === 'SUPPORT_AGENT';
                const isAdmin = c.user?.role === 'ADMIN';

                return (
                  <div
                    key={c.id}
                    className={`group flex items-start gap-2.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* User Avatar */}
                    <Avatar
                      name={c.user?.full_name}
                      className={
                        isOwn
                          ? 'bg-brand-600 text-white ring-2 ring-brand-100'
                          : isAgent
                          ? 'bg-emerald-100 text-emerald-800'
                          : isAdmin
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-slate-100 text-slate-700'
                      }
                    />

                    {/* Message Bubble + Meta */}
                    <div className={`flex max-w-[82%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                      {/* Author Header */}
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="text-xs font-semibold text-slate-800">
                          {isOwn ? 'You' : c.user?.full_name}
                        </span>
                        {!isOwn && (
                          <span
                            className={`rounded px-1.5 py-0.2 text-[10px] font-medium uppercase tracking-wider ${
                              isAgent
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                                : isAdmin
                                ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-600/20'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isAgent ? 'Support' : isAdmin ? 'Admin' : 'Employee'}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400" title={formatDateTime(c.created_at)}>
                          {relativeTime(c.created_at)}
                        </span>
                      </div>

                      {/* Bubble */}
                      <div
                        className={`relative rounded-2xl px-4 py-2.5 text-sm shadow-2xs leading-relaxed whitespace-pre-wrap break-words ${
                          isOwn
                            ? 'rounded-tr-xs bg-brand-600 text-white'
                            : 'rounded-tl-xs bg-slate-100 text-slate-800 ring-1 ring-slate-200/60'
                        }`}
                      >
                        {editingComment?.id === c.id ? (
                          <div className="space-y-2 py-1 text-slate-900">
                            <Textarea
                              rows={3}
                              value={editingComment.content}
                              onChange={(e) =>
                                setEditingComment((v) => ({ ...v, content: e.target.value }))
                              }
                              className="text-slate-900 bg-white"
                              aria-label="Edit comment text"
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setEditingComment(null)}
                              >
                                Cancel
                              </Button>
                              <Button size="sm" onClick={handleSaveEdit}>
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p>{c.content}</p>
                            {c.updated_at && c.updated_at !== c.created_at && (
                              <span
                                className={`mt-0.5 block text-[10px] italic ${
                                  isOwn ? 'text-brand-200 text-right' : 'text-slate-400'
                                }`}
                              >
                                (edited)
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Action buttons for own message */}
                      {isOwn && !editingComment && !closed && (
                        <div className="mt-1 flex items-center gap-2 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => setEditingComment({ id: c.id, content: c.content })}
                            className="text-xs text-slate-400 hover:text-brand-600 transition-colors inline-flex items-center gap-1"
                            title="Edit message"
                          >
                            <PencilLine className="size-3" />
                            <span>Edit</span>
                          </button>
                          <span className="text-slate-300">·</span>
                          <button
                            type="button"
                            onClick={() => setDeleteCommentTarget(c)}
                            className="text-xs text-slate-400 hover:text-red-600 transition-colors inline-flex items-center gap-1"
                            title="Delete message"
                          >
                            <Trash2 className="size-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="rounded-full bg-slate-100 p-3 text-slate-400">
                  <MessageSquare className="size-6" />
                </div>
                <p className="mt-2 text-sm font-medium text-slate-700">No messages yet</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Start the real-time conversation between agent and employee below.
                </p>
              </div>
            )}

            {/* Typing Indicator */}
            {typingUsers && typingUsers.length > 0 && (
              <div className="flex items-center gap-2 py-1 text-xs text-slate-500 animate-fade-in">
                <Avatar name={typingUsers[0].full_name} className="size-6 text-[10px]" />
                <span className="font-medium text-slate-700">
                  {typingUsers.map((u) => u.full_name).join(', ')}
                </span>
                <span>is typing</span>
                <span className="inline-flex items-center gap-1 ml-0.5">
                  <span className="size-1 rounded-full bg-slate-400 animate-bounce"></span>
                  <span className="size-1 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="size-1 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]"></span>
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Floating jump to bottom button */}
          {showScrollBottom && (
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-2 right-4 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md ring-1 ring-slate-200 transition-all hover:bg-slate-50 hover:shadow-lg"
            >
              <ChevronDown className="size-3.5" />
              <span>Latest</span>
            </button>
          )}
        </div>

        {/* Message Input Form */}
        {canComment ? (
          <form onSubmit={handleSend} className="mt-4 border-t border-slate-100 pt-3">
            <div className="relative">
              <Textarea
                rows={2}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message… (Press Enter to send, Shift+Enter for new line)"
                aria-label="Type your message"
                className="pr-20 resize-none text-sm"
              />
              <div className="absolute right-2.5 bottom-2.5">
                <Button
                  type="submit"
                  size="sm"
                  loading={submitting}
                  disabled={!inputText.trim()}
                  className="rounded-lg shadow-xs"
                >
                  <Send className="size-3.5" aria-hidden="true" />
                  <span>Send</span>
                </Button>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
              <span>Enter to send · Shift+Enter for newline</span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500"></span>
                <span>Real-time delivery</span>
              </span>
            </div>
          </form>
        ) : (
          <div className="mt-4 border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
            {closed
              ? 'This ticket is closed — the conversation is read-only.'
              : 'You can view but not participate in this ticket conversation.'}
          </div>
        )}
      </Panel>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteCommentTarget}
        onClose={() => setDeleteCommentTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete message?"
        message="This message will be permanently removed from the conversation."
      />
    </>
  );
}

