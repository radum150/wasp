/**
 * WebSocket client for real-time messaging.
 *
 * Handles:
 * - Connection & authentication
 * - Automatic reconnection with exponential backoff
 * - Message relay (encrypted envelopes)
 * - Delivery/read receipts
 * - Typing indicators
 * - Presence updates
 */

import type { WSMessage } from '@wasp/types';

type MessageHandler = (msg: Record<string, unknown>) => void;

// In dev, connect to localhost. In production, derive wss:// from the page origin
// so the URL is always correct without any extra env var.
const WS_URL: string = import.meta.env.VITE_WS_URL as string | undefined
  ?? (typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
    : 'ws://localhost:3000');

class WaspWebSocketClient {
  private ws: WebSocket | null = null;
  private accessToken: string | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private handlers = new Map<string, Set<MessageHandler>>();
  private messageQueue: string[] = [];
  private isAuthenticated = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  connect(token: string): void {
    this.accessToken = token;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.accessToken = null;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.close(1000, 'User logout');
      this.ws = null;
    }
    this.isAuthenticated = false;
    this.messageQueue = [];
  }

  private doConnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(WS_URL + '/ws');

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        // Authenticate immediately after connecting
        this.sendRaw({
          type: 'auth',
          id: crypto.randomUUID(),
          payload: { token: this.accessToken },
          timestamp: Date.now(),
        });

        // Keepalive ping
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25_000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>;
          const type = msg.type as string;

          if (type === 'auth_ok') {
            this.isAuthenticated = true;
            // Flush queued messages
            const queue = [...this.messageQueue];
            this.messageQueue = [];
            for (const raw of queue) {
              this.ws?.send(raw);
            }
          }

          // Dispatch to handlers
          const handlers = this.handlers.get(type);
          if (handlers) {
            handlers.forEach((h) => h(msg));
          }

          // Wildcard handlers
          const wildcards = this.handlers.get('*');
          if (wildcards) {
            wildcards.forEach((h) => h(msg));
          }
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      this.ws.onclose = (event) => {
        this.isAuthenticated = false;
        if (this.pingInterval) clearInterval(this.pingInterval);

        if (event.code !== 1000 && this.accessToken) {
          // Unexpected disconnect — reconnect with backoff
          this.scheduleReconnect();
        }

        this.emit('disconnected', { code: event.code, reason: event.reason });
      };

      this.ws.onerror = () => {
        console.error('[WS] Connection error');
      };
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached');
      this.emit('max_reconnects', {});
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;
    console.info(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.accessToken) this.doConnect();
    }, delay);
  }

  send(type: string, payload: unknown): string {
    const id = crypto.randomUUID();
    const msg = JSON.stringify({ type, id, payload, timestamp: Date.now() });

    if (this.isAuthenticated && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.messageQueue.push(msg);
    }

    return id;
  }

  sendMessage(to: string, envelope: string, messageId: string): string {
    return this.send('message', { to, envelope, messageId });
  }

  sendDeliveryReceipt(to: string, messageId: string): void {
    this.send('delivery_receipt', { to, messageId, deliveredAt: Date.now() });
  }

  sendReadReceipt(to: string, messageIds: string[]): void {
    this.send('read_receipt', { to, messageIds, readAt: Date.now() });
  }

  sendTyping(to: string, conversationId: string, isTyping: boolean): void {
    this.send('typing', { to, conversationId, isTyping });
  }

  subscribePresence(userIds: string[]): void {
    this.send('presence_subscribe', { userIds });
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.off(type, handler);
  }

  off(type: string, handler: MessageHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  private emit(type: string, payload: unknown): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach((h) => h({ type, payload } as Record<string, unknown>));
    }
  }

  private sendRaw(data: unknown): void {
    this.ws?.send(JSON.stringify(data));
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated;
  }
}

export const wsClient = new WaspWebSocketClient();
