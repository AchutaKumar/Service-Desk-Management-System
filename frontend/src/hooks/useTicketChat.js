import { useEffect, useRef, useState, useCallback } from 'react';
import { getWebSocketUrl } from '../api/websocket';
import { ticketsApi } from '../api';
import { tokenStore } from '../api/client';

export function useTicketChat(ticketId, initialComments = [], onTicketStatusChange = null) {
  const [comments, setComments] = useState(initialComments);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected' | 'error'
  const [typingUsers, setTypingUsers] = useState([]);

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);

  // Keep comments in sync when initialComments updates from initial ticket load
  useEffect(() => {
    if (initialComments && initialComments.length > 0) {
      setComments((prev) => {
        // Merge without losing real-time comments that might have arrived
        const commentMap = new Map();
        for (const c of prev) commentMap.set(c.id, c);
        for (const c of initialComments) commentMap.set(c.id, c);
        const sorted = Array.from(commentMap.values()).sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
        return sorted;
      });
    }
  }, [initialComments]);

  // Connect WebSocket
  const connect = useCallback(() => {
    if (!ticketId || !tokenStore.access) return;

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setConnectionStatus('connecting');

    try {
      const url = getWebSocketUrl(`/ws/tickets/${ticketId}/chat/`);
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'chat_message' && data.comment) {
            setComments((prev) => {
              const exists = prev.some((c) => c.id === data.comment.id);
              if (exists) {
                return prev.map((c) => (c.id === data.comment.id ? data.comment : c));
              }
              return [...prev, data.comment];
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
            } else {
              setTypingUsers((prev) => prev.filter((u) => u.id !== user.id));
            }
          } else if (data.type === 'ticket_status_changed') {
            onTicketStatusChange?.(data.status, data.data);
          }
        } catch {
          // Ignore non-JSON frame
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        setConnectionStatus('error');
      };

      ws.onclose = (event) => {
        if (!isMountedRef.current) return;
        setConnectionStatus('disconnected');

        // Do not auto-reconnect if closed cleanly or forbidden
        if (event.code === 4401 || event.code === 4403 || event.code === 1000) {
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
  }, [ticketId, onTicketStatusChange]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close(1000, 'Component unmounted');
        socketRef.current = null;
      }
    };
  }, [connect]);

  // Transmit typing indicator
  const sendTyping = useCallback((isTyping) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        action: 'typing',
        is_typing: isTyping,
      }));
    }
  }, []);

  // Post new message
  const sendMessage = useCallback(async (content) => {
    const text = content.trim();
    if (!text) return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        action: 'send_message',
        message: text,
      }));
      // Stop typing status after send
      sendTyping(false);
    } else {
      // Fallback to REST API if WebSocket is offline
      const { data } = await ticketsApi.addComment(ticketId, text);
      if (data?.data) {
        setComments((prev) => {
          if (prev.some((c) => c.id === data.data.id)) return prev;
          return [...prev, data.data];
        });
      }
    }
  }, [ticketId, sendTyping]);

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
      if (data?.data) {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, ...data.data } : c))
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
  };
}

