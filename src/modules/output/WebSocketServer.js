/**
 * WebSocketServer - Real-time feed for dashboard
 *
 * Provides WebSocket endpoint for real-time data streaming to dashboard clients.
 */

const WebSocket = require("ws");
const eventBus = require("../../core/EventBus");

class WebSocketServer {
  constructor() {
    this.config = null;
    this.server = null;
    this.clients = new Map(); // ws -> { id, ip, connectedAt }
    this.nextClientId = 1;
  }

  /**
   * Initialize WebSocket server
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("  WebSocketServer initialized");
  }

  /**
   * Start WebSocket server
   * @returns {Promise<void>}
   */
  async start() {
    // Guard against multiple starts
    if (this.server) {
      console.warn("  WebSocketServer already started, skipping...");
      return;
    }

    const port = this.config.port || 3001;

    this.server = new WebSocket.Server({ port });

    this.server.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.server.on("error", (error) => {
      console.error("WebSocketServer error:", error.message);
      eventBus.emitError(error, "WebSocketServer");
    });

    // Subscribe to normalized data (only once)
    eventBus.onDataNormalized((suo) => {
      this.broadcast(suo);
    });

    console.log(`  WebSocketServer listening on port ${port}`);
  }

  /**
   * Handle new WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {http.IncomingMessage} req - HTTP request
   */
  handleConnection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    const clientId = `client-${this.nextClientId++}`;
    const clientInfo = { id: clientId, ip: clientIp, connectedAt: new Date() };
    
    console.log(`[WebSocket] ${clientId} connected from ${clientIp}`);

    this.clients.set(ws, clientInfo);

    // Send welcome message
    this.send(ws, {
      type: "connected",
      message: "Connected to IoT Middleware Pro",
      timestamp: new Date(),
    });

    // Handle incoming messages (for commands, etc.)
    ws.on("message", (data) => {
      this.handleMessage(ws, data);
    });

    // Handle disconnection
    ws.on("close", () => {
      console.log(`[WebSocket] ${clientId} disconnected from ${clientIp}`);
      this.clients.delete(ws);
    });

    // Handle errors
    ws.on("error", (error) => {
      console.error(`WebSocket client error:`, error.message);
      this.clients.delete(ws);
    });

    // Send initial state (optional - could send current devices list)
    this.send(ws, {
      type: "ready",
      timestamp: new Date(),
    });
  }

  /**
   * Handle incoming WebSocket message
   * @param {WebSocket} ws - WebSocket connection
   * @param {Buffer|ArrayBuffer|string} data - Message data
   */
  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());

      // Handle command requests from dashboard
      if (message.type === "command") {
        eventBus.emitCommandRequest({
          deviceId: message.deviceId,
          deviceType: message.deviceType,
          messageType: message.messageType,
          payload: message.payload || {},
          timestamp: new Date(),
        });

        // Send acknowledgment
        this.send(ws, {
          type: "command_ack",
          messageId: message.messageId,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error("WebSocket message error:", error.message);
      eventBus.emitError(error, "WebSocketServer");
    }
  }

  /**
   * Broadcast data to all connected clients
   * @param {Object} suo - Standard Unified Object
   */
  broadcast(suo) {
    const message = {
      type: "data",
      data: suo,
      timestamp: new Date(),
    };

    const payload = JSON.stringify(message);
    const clientIds = [];

    // Send to all connected clients
    this.clients.forEach((clientInfo, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
          clientIds.push(clientInfo.id);
        } catch (error) {
          console.error(`[WebSocket] Failed to send to ${clientInfo.id}:`, error.message);
          this.clients.delete(ws);
        }
      }
    });

    //TEMP-LOG: Log once per broadcast with client IDs
    if (clientIds.length > 0) {
      console.log(`[WebSocket] Broadcast ${suo.messageType} (msgId: ${suo.messageId}) to: [${clientIds.join(", ")}]`);
    }
  }

  /**
   * Send message to specific client
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message to send
   */
  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("Failed to send to WebSocket client:", error.message);
      }
    }
  }

  /**
   * Get client count
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Stop WebSocket server
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("  Stopping WebSocketServer...");

    // Close all client connections
    this.clients.forEach((clientInfo, ws) => {
      console.log(`[WebSocket] Closing ${clientInfo.id}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    this.clients.clear();

    // Close server
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Unsubscribe from events
    eventBus.removeAllListeners("data.normalized");

    console.log("  WebSocketServer stopped");
  }
}

module.exports = new WebSocketServer();
