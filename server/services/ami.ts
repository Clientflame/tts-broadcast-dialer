import * as net from "net";
import { EventEmitter } from "events";

export interface AMIConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface AMIAction {
  Action: string;
  [key: string]: string;
}

export interface AMIEvent {
  Event?: string;
  Response?: string;
  ActionID?: string;
  [key: string]: string | undefined;
}

class AMIClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private config: AMIConfig;
  private connected = false;
  private authenticated = false;
  private buffer = "";
  private actionCounter = 0;
  private pendingActions = new Map<string, { resolve: (v: AMIEvent) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 120000; // 2 minutes max

  constructor(config: AMIConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected && this.authenticated) { resolve(); return; }

      this.socket = net.createConnection({
        host: this.config.host,
        port: this.config.port,
        timeout: 10000,
      });

      let resolved = false;

      this.socket.on("connect", () => {
        this.connected = true;
        // Clear the connection timeout once TCP is established
        this.socket?.setTimeout(0);
        console.log("[AMI] Connected to", this.config.host);
      });

      this.socket.on("data", (data) => {
        this.buffer += data.toString();
        this.processBuffer();
        if (this.authenticated && !resolved) {
          resolved = true;
          resolve();
        }
      });

      this.socket.on("close", () => {
        this.connected = false;
        this.authenticated = false;
        this.emit("disconnected");
        if (this.shouldReconnect) this.scheduleReconnect();
        if (!resolved) { resolved = true; reject(new Error("Connection closed")); }
      });

      this.socket.on("error", (err) => {
        console.error("[AMI] Socket error:", err.message);
        if (!resolved) { resolved = true; reject(err); }
      });

      this.socket.on("timeout", () => {
        console.error("[AMI] Connection timeout");
        this.socket?.destroy();
        if (!resolved) { resolved = true; reject(new Error("Connection timeout")); }
      });
    });
  }

  private processBuffer() {
    // The AMI banner ("Asterisk Call Manager/x.x.x\r\n") is a single line
    // terminated by \r\n, not \r\n\r\n like other messages. Handle it first.
    const bannerMatch = this.buffer.match(/^Asterisk Call Manager\/[^\r\n]+\r\n/);
    if (bannerMatch) {
      console.log("[AMI] Received banner:", bannerMatch[0].trim());
      this.buffer = this.buffer.substring(bannerMatch[0].length);
      this.login();
    }

    // Process complete messages (terminated by \r\n\r\n)
    const messages = this.buffer.split("\r\n\r\n");
    this.buffer = messages.pop() || "";

    for (const msg of messages) {
      if (!msg.trim()) continue;
      const parsed = this.parseMessage(msg);

      if (parsed.Response === "Success" && parsed.Message === "Authentication accepted") {
        this.authenticated = true;
        this.reconnectAttempts = 0; // Reset backoff on successful auth
        // Ensure no lingering timeout kills the persistent connection
        this.socket?.setTimeout(0);
        this.startKeepalive();
        console.log("[AMI] Authentication accepted");
        this.emit("authenticated");
        continue;
      }

      if (parsed.Response === "Error" && parsed.Message === "Authentication failed") {
        console.error("[AMI] Authentication failed");
        this.emit("authFailed");
        return;
      }

      if (parsed.ActionID && this.pendingActions.has(parsed.ActionID)) {
        const pending = this.pendingActions.get(parsed.ActionID)!;
        clearTimeout(pending.timer);
        this.pendingActions.delete(parsed.ActionID);
        pending.resolve(parsed);
        continue;
      }

      if (parsed.Event) {
        this.emit("event", parsed);
        this.emit(`event:${parsed.Event}`, parsed);
      }
    }
  }

  private parseMessage(msg: string): AMIEvent {
    const result: AMIEvent = {};
    const lines = msg.split("\r\n");
    for (const line of lines) {
      const idx = line.indexOf(": ");
      if (idx > 0) {
        result[line.substring(0, idx).trim()] = line.substring(idx + 2).trim();
      }
    }
    return result;
  }

  private login() {
    this.sendRaw(
      `Action: Login\r\nUsername: ${this.config.username}\r\nSecret: ${this.config.password}\r\n\r\n`
    );
  }

  private sendRaw(data: string) {
    if (this.socket && this.connected) {
      this.socket.write(data);
    }
  }

  async sendAction(action: AMIAction, extraLines?: string[]): Promise<AMIEvent> {
    if (!this.connected || !this.authenticated) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const actionId = `manus-${++this.actionCounter}-${Date.now()}`;
      const timer = setTimeout(() => {
        this.pendingActions.delete(actionId);
        reject(new Error(`AMI action timeout: ${action.Action}`));
      }, 30000);

      this.pendingActions.set(actionId, { resolve, reject, timer });

      let msg = `ActionID: ${actionId}\r\n`;
      for (const [key, value] of Object.entries(action)) {
        msg += `${key}: ${value}\r\n`;
      }
      // Append extra lines (e.g. multiple Variable: lines)
      if (extraLines) {
        for (const line of extraLines) {
          msg += `${line}\r\n`;
        }
      }
      msg += "\r\n";
      this.sendRaw(msg);
    });
  }

  async originate(params: {
    channel: string;
    context: string;
    exten: string;
    priority: string;
    callerId?: string;
    timeout?: number;
    variables?: Record<string, string>;
    async?: boolean;
  }): Promise<AMIEvent> {
    const action: AMIAction = {
      Action: "Originate",
      Channel: params.channel,
      Context: params.context,
      Exten: params.exten,
      Priority: params.priority,
      Timeout: String(params.timeout || 30000),
      Async: params.async !== false ? "true" : "false",
    };

    if (params.callerId) action.CallerID = params.callerId;

    // Send each variable on its own "Variable:" line to avoid
    // comma-separated format breaking on URLs with special chars
    const extraLines: string[] = [];
    if (params.variables) {
      for (const [k, v] of Object.entries(params.variables)) {
        extraLines.push(`Variable: ${k}=${v}`);
      }
    }

    return this.sendAction(action, extraLines);
  }

  private startKeepalive() {
    this.stopKeepalive();
    // Send a Ping every 60 seconds to keep the connection alive
    this.keepaliveTimer = setInterval(() => {
      if (this.connected && this.authenticated) {
        this.sendRaw(`Action: Ping\r\nActionID: keepalive-${Date.now()}\r\n\r\n`);
      }
    }, 60000);
  }

  private stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.stopKeepalive();
    // Exponential backoff: 10s, 20s, 40s, 80s, 120s max
    const delay = Math.min(10000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    console.log(`[AMI] Scheduling reconnect in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        console.log("[AMI] Attempting reconnect...");
        await this.connect();
      } catch (e) {
        console.error("[AMI] Reconnect failed:", (e as Error).message);
        this.scheduleReconnect();
      }
    }, delay);
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopKeepalive();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.pendingActions.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(new Error("Disconnecting"));
    });
    this.pendingActions.clear();
    if (this.socket) { this.socket.destroy(); this.socket = null; }
    this.connected = false;
    this.authenticated = false;
  }

  isConnected() { return this.connected && this.authenticated; }
}

let amiClient: AMIClient | null = null;
let amiConnecting = false;

function getAMIConfig(): AMIConfig {
  return {
    host: process.env.FREEPBX_HOST || "45.77.75.198",
    port: parseInt(process.env.FREEPBX_AMI_PORT || "5038"),
    username: process.env.FREEPBX_AMI_USER || "broadcast_dialer",
    password: process.env.FREEPBX_AMI_PASSWORD || "",
  };
}

export function getAMIClient(): AMIClient {
  if (!amiClient) {
    amiClient = new AMIClient(getAMIConfig());
  }
  return amiClient;
}

/** Attempt to connect if not already connected (non-blocking) */
export function ensureAMIConnected(): void {
  if (amiConnecting) return;
  const client = getAMIClient();
  if (client.isConnected()) return;
  amiConnecting = true;
  client.connect()
    .then(() => {
      console.log("[AMI] Successfully connected and authenticated");
      amiConnecting = false;
    })
    .catch((err) => {
      console.error("[AMI] Connection failed:", (err as Error).message);
      amiConnecting = false;
    });
}

export function getAMIStatus(): { connected: boolean; host: string; port: number } {
  // Trigger a connection attempt if not connected
  if (!amiClient?.isConnected()) {
    ensureAMIConnected();
  }
  return {
    connected: amiClient?.isConnected() ?? false,
    host: process.env.FREEPBX_HOST || "45.77.75.198",
    port: parseInt(process.env.FREEPBX_AMI_PORT || "5038"),
  };
}

// AMI auto-connect disabled - PBX agent handles AMI locally on the FreePBX server
// The web app no longer needs a direct AMI connection
// if (process.env.FREEPBX_AMI_PASSWORD) {
//   setTimeout(() => {
//     console.log("[AMI] Auto-connecting to FreePBX at", process.env.FREEPBX_HOST || "45.77.75.198");
//     ensureAMIConnected();
//   }, 2000);
// }
