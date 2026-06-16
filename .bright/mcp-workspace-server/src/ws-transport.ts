import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessageSchema, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import websocket from 'ws';

type RawData = Buffer | ArrayBuffer | Buffer[];

function toText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf-8');
  }

  if (Buffer.isBuffer(data)) {
    return data.toString('utf-8');
  }

  return Buffer.from(data).toString('utf-8');
}

// WebSocketClientTransport is a custom MCP transport that dials outbound from CI to the
// Star WebSocket hub. The MCP server runs over this connection; Star's MCP client wraps
// the accepted side. This replaces the Bridges/Repeater HTTPS-proxy infrastructure.
export class WebSocketClientTransport implements Transport {
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage) => void;

  private readonly url: URL;
  private readonly token: string;
  private ws?: websocket;

  constructor(url: URL, token: string) {
    this.url = url;
    this.token = token;
  }

  public start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const headers = this.token ? { Authorization: `Bearer ${this.token}` } : undefined;
      const socket = new websocket(this.url, { headers });
      this.ws = socket;

      socket.on('open', () => {
        resolve();
      });

      socket.on('error', (err: Error) => {
        this.onerror?.(err);
        reject(err);
      });

      socket.on('close', () => {
        this.onclose?.();
      });

      socket.on('message', (data: RawData) => {
        this.handleMessage(toText(data));
      });
    });
  }

  public send(message: JSONRPCMessage): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('transport not connected'));

        return;
      }

      this.ws.send(JSON.stringify(message), (err?: Error) => {
        if (err) {
          reject(err);

          return;
        }

        resolve();
      });
    });
  }

  public close(): Promise<void> {
    this.ws?.close();

    return Promise.resolve();
  }

  private handleMessage(raw: string): void {
    try {
      const parsed = JSONRPCMessageSchema.parse(JSON.parse(raw));
      this.onmessage?.(parsed);
    } catch (e: unknown) {
      this.onerror?.(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
