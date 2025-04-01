import Transport, { TransportStreamOptions } from "winston-transport";
import { WebSocket, WebSocketServer } from "ws";

/**
 * WebSocketTransport is a transport for Winston that creates a WebSocket server and sends logs to connected clients to the WebSocket server.
 */
export class WebSocketTransport extends Transport {
  private wss: WebSocketServer;
  private clients: Set<WebSocket>;

  /**
   * Creates a new WebSocketTransport and starts a WebSocket server on the given port and path
   * @param {Object} options - The options for the transport
   * @param {number} options.port - The port to listen on
   * @param {string} options.path - The path to listen on
   * @param {TransportStreamOptions} [opts] - The options for the transport
   */
  constructor(
    { port, path }: { port: number; path: string },
    opts?: TransportStreamOptions
  ) {
    super(opts);
    this.wss = new WebSocketServer({ port, path });
    this.clients = new Set<WebSocket>();
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);

      ws.on("close", () => {
        this.clients.delete(ws);
      });
    });
  }

  /**
   * Broadcasts a log message to all connected clients
   * @param {any} info - The message to log
   * @param {Function} next - The next function to call
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public log(info: any, next: () => void): void {
    const log = { ...info, timestamp: new Date().toISOString() };
    setImmediate(() => this.emit("logged", log));

    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(log));
      }
    }

    next();
  }
}

/**
 * Creates a new WebSocketTransport and starts a WebSocket server on the given port and path
 * @param {Object} options - The options to configure the WebSocket server
 * @param {number} options.port - The port to listen on
 * @param {string} options.path - The path to listen on
 * @returns {WebSocketTransport} The new WebSocketTransport
 */
export const websocket = ({ port, path }: { port: number; path: string }) =>
  new WebSocketTransport({ port, path });
