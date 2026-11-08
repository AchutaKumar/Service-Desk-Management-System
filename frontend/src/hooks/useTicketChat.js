import { useEffect, useRef, useState, useCallback } from 'react';
import { getWebSocketUrl } from '../api/websocket';
import { ticketsApi } from '../api';
import { tokenStore } from '../api/client';

export function useTicketChat(ticketId, initialComments = [], onTicketStatusChange = null) {
  const [comments, setComments] = useState(initialComments || []);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected' | 'error'
  const [typingUsers, setTypingUsers] = useState([]);

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const isFetchingRef = useRef(false);

  // Helper to merge new comments into existing comments state without duplicates
  const mergeComments = useCallback((newComments) => {
    if (!newComments || !newComments.length) return;
    setComments((prev) => {
      const commentMap = new Map();
      // Keep existing comments
      for (const c of prev) {
        commentMap.set(c.id, c);
      }
      // Merge incoming comments (updating if modified)
      for (const c of newComments) {
        commentMap.set(c.id, c);
      }
      return Array.from(commentMap.values()).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
    });
  }, []);

  // Sync comments from backend REST API (silent background refresh)
  const syncComments = useCallback(async () => {
    if (!ticketId || isFetchingRef.current || !isMountedRef.current) return;
    try {
      isFetchingRef.current = true;
      const { data } = await ticketsApi.comments(ticketId);
      const list = data?.data || data?.results || (Array.isArray(data) ? data : []);
      if (isMountedRef.current && list.length > 0) {
        mergeComments(list);
      }
    } catch {
      // Ignore background sync errors silently
    } finally {
      isFetchingRef.current = false;
    }
  }, [ticketId, mergeComments]);

  // Keep comments in sync when initialComments updates from initial ticket load
  useEffect(() => {
    if (initialComments && initialComments.length > 0) {
      mergeComments(initialComments);
    }
  }, [initialComments, mergeComments]);

  // Background polling sync:
  // Every 3 seconds when offline, every 6 seconds when online (bulletproof backup)
  useEffect(() => {
    const intervalTime = connectionStatus === 'connected' ? 6000 : 3000;
    pollIntervalRef.current = setInterval(() => {
      syncComments();
    }, intervalTime);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [connectionStatus, syncComments]);

  // Sync immediately when user switches back to this browser tab
  useEffect(() => {
    const handleFocus = () => {
      syncComments();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncComments]);

  // Connect WebSocket
  const connect = useCallback(() => {
    if (!ticketId || !tokenStore.access) return;

    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {
        // ignore
      }
      socketRef.current = null;
    }

    setConnectionStatus('connecting');

    try {
      const url = getWebSocketUrl(`/ws/tickets/${ticketId}/chat/`);
      const ws = new WebSocket(url);
      socketRef.current = ws;

      // Keepalive ping every 25 seconds to prevent proxy / cloud timeout
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ action: 'ping' }));
          } catch {
            // ignore
          }
        }
      }, 25000);

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        // Sync any comments that might have arrived while connecting
        syncComments();
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'chat_message' && data.comment) {
            setComments((prev) => {
              // Replace optimistic temp message if present, or add/update
              const filtered = prev.filter((c) => !c.isOptimistic || c.content !== data.comment.content);
              const exists = filtered.some((c) => c.id === data.comment.id);
              if (exists) {
                return filtered.map((c) => (c.id === data.comment.id ? data.comment : c));
              }
              const updated = [...filtered, data.comment];
              return updated.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            });
          } else if (data.type === 'comment_updated' && data.comment) {
            setComments((prev) =>
              prev.map((c) => (c.id === data.comment.id ? { ...c, ...data.comment } : c))
            );
          } else if (data.type === 'comment_deleted') {
            const commentId = Number(data.comment_id);
            setComments((prev) => prev.filter((c) => c.id !== commentId));
          } else if (data.type === 'typing') {
            const user = data.user;
            if (data.is_typing) {
              setTypingUsers((prev) => {
                if (prev.some((u) => u.id === user.id)) return prev;
                return [...prev, user];
              });
              // Auto-clear stale typing indicator after 5 seconds
              setTimeout(() => {
                if (isMountedRef.current) {
                  setTypingUsers((prev) => prev.filter((u) => u.id !== user.id));
                }
              }, 5000);
            } else {
              setTypingUsers((prev) => prev.filter((u) => u.id !== user.id));
            }
          } else if (data.type === 'ticket_status_changed') {
            onTicketStatusChange?.(data.status, data.data);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        setConnectionStatus('error');
      };

      ws.onclose = (event) => {
        if (!isMountedRef.current) return;
        setConnectionStatus('disconnected');
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        // Do not auto-reconnect if closed cleanly on unmount (1000) or forbidden (4403)
        if (event.code === 4403) {
          return;
        }

        // Exponential backoff reconnect: 1s, 2s, 4s, max 8s
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 8000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) connect();
        }, delay);
      };
    } catch {
      setConnectionStatus('error');
    }
  }, [ticketId, onTicketStatusChange, syncComments]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (socketRef.current) {
        socketRef.current.close(1000, 'Component unmounted');
        socketRef.current = null;
      }
    };
  }, [connect]);

  // Transmit typing indicator
  const sendTyping = useCallback((isTyping) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify({
          action: 'typing',
          is_typing: isTyping,
        }));
      } catch {
        // ignore
      }
    }
  }, []);

  // Post new message (optimistic instant update + WebSocket or REST dispatch)
  const sendMessage = useCallback(async (content) => {
    const text = content.trim();
    if (!text) return;

    const isWsOpen = socketRef.current && socketRef.current.readyState === WebSocket.OPEN;

    if (isWsOpen) {
      try {
        socketRef.current.send(JSON.stringify({
          action: 'send_message',
          message: text,
        }));
        sendTyping(false);
      } catch {
        // If send failed, fallback to REST
        const { data } = await ticketsApi.addComment(ticketId, text);
        const savedComment = data?.data || data;
        if (savedComment) {
          mergeComments([savedComment]);
        }
      }
    } else {
      // Fallback to REST API if WebSocket is not open
      const { data } = await ticketsApi.addComment(ticketId, text);
      const savedComment = data?.data || data;
      if (savedComment) {
        mergeComments([savedComment]);
      }
    }
  }, [ticketId, sendTyping, mergeComments]);

  // Edit message
  const editMessage = useCallback(async (commentId, newContent) => {
    const text = newContent.trim();
    if (!text) return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        action: 'edit_message',
        comment_id: commentId,
        content: text,
      }));
    } else {
      const { data } = await ticketsApi.updateComment(ticketId, commentId, text);
      const updated = data?.data || data;
      if (updated) {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, ...updated } : c))
        );
      }
    }
  }, [ticketId]);

  // Delete message
  const deleteMessage = useCallback(async (commentId) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        action: 'delete_message',
        comment_id: commentId,
      }));
    } else {
      await ticketsApi.deleteComment(ticketId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  }, [ticketId]);

  return {
    comments,
    connectionStatus,
    typingUsers,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
    reconnect: connect,
    sync: syncComments,
  };
}
