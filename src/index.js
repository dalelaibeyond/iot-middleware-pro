/**
 * IoT Middleware Pro - Main Entry Point
 *
 * Application entry point that initializes and starts all modules.
 * Handles graceful shutdown on process signals.
 */

const config = require("config");
const eventBus = require("./core/EventBus");
const database = require("./core/Database");
const moduleManager = require("./core/ModuleManager");

// Import all modules
const mqttSubscriber = require("./modules/ingress/MqttSubscriber");
const parserManager = require("./modules/parsers/ParserManager");
const normalizer = require("./modules/normalizer/UnifyNormalizer");
const stateCache = require("./modules/normalizer/StateCache");
const cacheWatchdog = require("./modules/normalizer/CacheWatchdog");
const storageService = require("./modules/storage/StorageService");
const commandService = require("./modules/command/CommandService");
const mqttRelay = require("./modules/output/MqttRelay");
const webhookService = require("./modules/output/WebhookService");
const apiServer = require("./modules/output/ApiServer");
const webSocketServer = require("./modules/output/WebSocketServer");

// Register modules with ModuleManager
moduleManager.register("database", database);
moduleManager.register("eventBus", eventBus);
moduleManager.register("mqttSubscriber", mqttSubscriber);
moduleManager.register("parserManager", parserManager);
moduleManager.register("normalizer", normalizer);
moduleManager.register("stateCache", stateCache);
moduleManager.register("cacheWatchdog", cacheWatchdog);
moduleManager.register("storage", storageService);
moduleManager.register("command", commandService);
moduleManager.register("mqttRelay", mqttRelay);
moduleManager.register("webhook", webhookService);
moduleManager.register("apiServer", apiServer);
moduleManager.register("webSocketServer", webSocketServer);

// Error handling
eventBus.onError((error) => {
  console.error(`[${error.source}] Error:`, error.message);
  if (error.error && error.error.stack) {
    console.error("Stack trace:", error.error.stack);
  }
});

// Graceful shutdown handlers
async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  try {
    await moduleManager.stop();
    await database.close();
    console.log("Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error.message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Uncaught exception handler
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  shutdown("uncaughtException");
});

// Unhandled promise rejection handler
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  shutdown("unhandledRejection");
});

// Main application startup
async function main() {
  try {
    console.log("========================================");
    console.log("  IoT Middleware Pro v2.0.0");
    console.log("========================================");
    console.log("");

    // Initialize all modules
    await moduleManager.initialize();
    console.log("");

    // Start all modules
    await moduleManager.start();
    console.log("");

    console.log("========================================");
    console.log("  All systems operational");
    console.log("========================================");
    console.log("");
    console.log("Press Ctrl+C to stop");
  } catch (error) {
    console.error("Failed to start application:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
}

// Start the application
main();
