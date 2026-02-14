/**
 * Core Logger Module
 * Singleton winston logger with console and daily rotate file transports
 */

const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const config = require("config");

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

/**
 * Custom console format: Timestamp + Level + Message + Meta
 */
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

/**
 * Prints a JSON object with a compact plain text style:
 * - Objects are pretty-printed with indentation.
 * - Array items are collapsed into a single line each.
 */
function printCompactJson(obj) {
  const jsonString = JSON.stringify(
    obj,
    (key, value) => {
      // If the value is an array, we stringify it into a single line
      // to prevent the default multi-line behavior for array elements.
      if (Array.isArray(value)) {
        return `__ARRAY_START__${JSON.stringify(value)}__ARRAY_END__`;
      }
      return value;
    },
    2,
  );

  // Post-process: Remove the quotes and markers around the collapsed arrays
  const formatted = jsonString
    .replace(/"__ARRAY_START__|__ARRAY_END__"/g, "") // Remove markers
    .replace(/\\"/g, '"'); // Fix escaped quotes inside the array strings

  console.log(formatted);
}

/**
 * Logger class - Singleton pattern
 */
class Logger {
  constructor() {
    if (Logger.instance) {
      return Logger.instance;
    }

    this.logger = null;
    Logger.instance = this;
  }

  /**
   * Initialize the logger with configuration
   * @param {Object} loggingConfig - Logging configuration from config file
   */
  initialize(loggingConfig) {
    const logLevel = loggingConfig.level || "info";
    const logDir = loggingConfig.dir || "logs";
    const maxSize = loggingConfig.maxSize || "20m";
    const maxFiles = loggingConfig.maxFiles || "14d";
    const enableConsole = loggingConfig.console !== false;
    const enableFile = loggingConfig.file !== false;

    const transports = [];

    // Console transport: colorize() + custom printf format
    if (enableConsole) {
      transports.push(
        new winston.transports.Console({
          level: logLevel,
          format: combine(
            colorize(),
            timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
            consoleFormat,
          ),
        }),
      );
    }

    // File transports (only if file logging enabled)
    if (enableFile) {
      // DailyRotateFile for errors: logs/error-%DATE%.log, level: error
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, "error-%DATE%.log"),
          level: "error",
          format: combine(
            timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
            json(),
            errors({ stack: true }), // Ensure stack traces are included
          ),
          datePattern: "YYYY-MM-DD",
          maxSize: maxSize,
          maxFiles: maxFiles,
        }),
      );

      // DailyRotateFile for combined: logs/combined-%DATE%.log, level: config level, format: json()
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, "combined-%DATE%.log"),
          level: logLevel,
          format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), json()),
          datePattern: "YYYY-MM-DD",
          maxSize: maxSize,
          maxFiles: maxFiles,
        }),
      );
    }

    const exceptionHandlers = enableFile
      ? [
          new DailyRotateFile({
            filename: path.join(logDir, "exceptions-%DATE%.log"),
            datePattern: "YYYY-MM-DD",
            maxSize: maxSize,
            maxFiles: maxFiles,
            format: combine(timestamp(), json()),
          }),
        ]
      : [];

    const rejectionHandlers = enableFile
      ? [
          new DailyRotateFile({
            filename: path.join(logDir, "rejections-%DATE%.log"),
            datePattern: "YYYY-MM-DD",
            maxSize: maxSize,
            maxFiles: maxFiles,
            format: combine(timestamp(), json()),
          }),
        ]
      : [];

    this.logger = winston.createLogger({
      level: logLevel,
      defaultMeta: { service: "iot-middleware-pro" },
      transports: transports,
      // Handle uncaught exceptions
      exceptionHandlers: exceptionHandlers,
      // Handle unhandled promise rejections
      rejectionHandlers: rejectionHandlers,
      exitOnError: false,
    });

    console.log("[Logger] Initialized successfully");
    console.log(
      `[Logger] Level: ${logLevel}, Console: ${enableConsole}, File: ${enableFile}, Dir: ${logDir}`,
    );
  }

  /**
   * Log an info message with optional metadata
   * @param {string} msg - Message to log
   * @param {Object} meta - Optional metadata object
   */
  info(msg, meta = {}) {
    if (!this.logger) {
      console.log("[Logger] Warning: Logger not initialized, using console");
      console.log(`[INFO] ${msg}`, meta);
      return;
    }
    this.logger.info(msg, meta);
  }

  /**
   * Log a warning message with optional metadata
   * @param {string} msg - Message to log
   * @param {Object} meta - Optional metadata object
   */
  warn(msg, meta = {}) {
    if (!this.logger) {
      console.log("[Logger] Warning: Logger not initialized, using console");
      console.warn(`[WARN] ${msg}`, meta);
      return;
    }
    this.logger.warn(msg, meta);
  }

  /**
   * Log an error message with optional Error object
   * @param {string} msg - Message to log
   * @param {Error} errorObj - Optional Error object (stack trace will be logged)
   */
  error(msg, errorObj = null) {
    if (!this.logger) {
      console.log("[Logger] Warning: Logger not initialized, using console");
      console.error(`[ERROR] ${msg}`, errorObj);
      return;
    }

    if (errorObj instanceof Error) {
      this.logger.error(msg, {
        error: errorObj.message,
        stack: errorObj.stack,
      });
    } else if (errorObj) {
      this.logger.error(msg, { error: errorObj });
    } else {
      this.logger.error(msg);
    }
  }

  /**
   * Log a debug message with optional metadata
   * @param {string} msg - Message to log
   * @param {Object} meta - Optional metadata object
   */
  debug(msg, meta = {}) {
    if (!this.logger) {
      console.log("[Logger] Warning: Logger not initialized, using console");
      console.log(`[DEBUG] ${msg}`);
      printCompactJson(meta);
      return;
    }
    // Print message header and compact JSON
    console.log(`[DEBUG] ${msg}`);
    //printCompactJson(meta);
    console.log(meta);
  }

  /**
   * Get the underlying winston logger instance
   * @returns {winston.Logger} Winston logger instance
   */
  getLogger() {
    return this.logger;
  }
}

// Export singleton instance
const loggerInstance = new Logger();

// Auto-initialize if config is available
try {
  const loggingConfig = config.get("logging");
  loggerInstance.initialize(loggingConfig);
} catch (e) {
  // Config not available yet, will need manual initialization
  console.log("[Logger] Auto-initialization skipped: config not available");
}

module.exports = loggerInstance;
