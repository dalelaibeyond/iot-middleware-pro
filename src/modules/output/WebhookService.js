/**
 * WebhookService - Output module for sending data via HTTP webhook
 *
 * Sends normalized data to a configured webhook URL.
 * Supports filtering by message type.
 */

const http = require("http");
const https = require("https");
const eventBus = require("../../core/EventBus");

class WebhookService {
  constructor() {
    this.config = null;
  }

  /**
   * Initialize webhook service
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config) {
    this.config = config;
    console.log("  WebhookService initialized");
  }

  /**
   * Start webhook service
   * @returns {Promise<void>}
   */
  async start() {
    // Subscribe to normalized data
    eventBus.onDataNormalized((suo) => {
      this.handleData(suo);
    });

    console.log("  WebhookService started");
  }

  /**
   * Handle normalized data
   * @param {Object} suo - Standard Unified Object
   */
  async handleData(suo) {
    try {
      // Check if this message type should be sent
      if (this.config.filters && this.config.filters.length > 0) {
        if (!this.config.filters.includes(suo.messageType)) {
          return; // Skip this message type
        }
      }

      // Send to webhook URL
      await this.sendWebhook(suo);
    } catch (error) {
      console.error("WebhookService error:", error.message);
      eventBus.emitError(error, "WebhookService");
    }
  }

  /**
   * Send data to webhook URL
   * @param {Object} suo - Standard Unified Object
   * @returns {Promise<void>}
   */
  async sendWebhook(suo) {
    const url = this.config.url;
    if (!url) {
      console.warn("WebhookService: No URL configured");
      return;
    }

    const payload = JSON.stringify(suo);
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 10000, // 10 second timeout
    };

    return new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`Webhook sent successfully: ${suo.messageType}`);
          } else {
            console.error(
              `Webhook failed with status ${res.statusCode}: ${data}`,
            );
          }
          resolve();
        });
      });

      req.on("error", (error) => {
        console.error(`Webhook request failed:`, error.message);
        reject(error);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Webhook request timeout"));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Stop webhook service
   * @returns {Promise<void>}
   */
  async stop() {
    console.log("  Stopping WebhookService...");

    // Unsubscribe from events
    eventBus.removeAllListeners("data.normalized");

    console.log("  WebhookService stopped");
  }
}

module.exports = new WebhookService();
