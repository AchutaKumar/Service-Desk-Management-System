import { useEffect, useRef, useState, useCallback } from 'react';
import { getWebSocketUrl, isWebSocketSupported } from '../api/websocket';
import { ticketsApi } from '../api';
import { tokenStore } from '../api/client';

export function useTicketChat(ticketId, initialComments = [], onTicketStatusChange = null) {
  const [comments, setComments] = useState(initialComments || []);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected'
  const [typingUsers, setTypingUsers] = useState([]);

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const isFetchingRef = useRef(false);

  // Helper to merge comments without duplicates
  const mergeComments = useCallback((newComments) => {
    if (!newComments || !newComments.length) return;
    setComments((prev) => {
      const commentMap = new Map();
      for (const c of prev) {
        commentMap.set(c.id, c);
      }
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
  // Runs every 2 seconds to guarantee instant updates on Vercel Serverless
  // and serves as a bulletproof backup when WebSocket packets are dropped.
  useEffect(() => {
    pollIntervalRef.current = setInterval(() => {
      syncComments();
    }, 2000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [syncComments]);

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

  // Connect WebSocket if supported
  const connect = useCallback(() => {
    if (!ticketId || !tokenStore.access) return;

    // Check if WebSockets are supported on this deployment (e.g. Vercel Serverless has no WS)
    const url = getWebSocketUrl(`/ws/tickets/${ticketId}/chat/`);
    if (!url) {
      // WebSockets not supported (Vercel Serverless) — Live Auto-Sync is active!
      setConnectionStatus('connected');
      syncComments();
      return;
    }

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
      const ws = new WebSocket(url);
      socketRef.current = ws;

      // Keepalive ping every 25 seconds
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
        syncComments();
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'chat_message' && data.comment) {
            setComments((prev) => {
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
          // Ignore
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        // On error (e.g. Vercel handshake), stay 'connected' via background auto-sync
        setConnectionStatus('connected');
      };

      ws.onclose = (event) => {
        if (!isMountedRef.current) return;
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        // Keep status as connected because 2s background polling is active
        setConnectionStatus('connected');

        if (event.code === 4403 || event.code === 1000) {
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
      // In case WebSocket constructor throws, fall back to auto-sync
      setConnectionStatus('connected');
    }
  }, [ticketId, onTicketStatusChange, syncComments]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, 'Component unmounted');
        } catch {
          // ignore
        }
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
        setTimeout(() => {
          if (isMountedRef.current) syncComments();
        }, 400);
      } catch {
        const { data } = await ticketsApi.addComment(ticketId, text);
        const savedComment = data?.data || data;
        if (savedComment) {
          mergeComments([savedComment]);
        }
      }
    } else {
      // Fallback to REST API if WebSocket is not open (e.g. Vercel Serverless)
      const { data } = await ticketsApi.addComment(ticketId, text);
      const savedComment = data?.data || data;
      if (savedComment) {
        mergeComments([savedComment]);
      }
    }
  }, [ticketId, sendTyping, mergeComments, syncComments]);

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
