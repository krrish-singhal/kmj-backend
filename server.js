import app from "./src/app.js";
import { initFirebase } from "./src/config/firebase.js";
import { config } from "./src/config/env.js";
import { logger } from "./src/utils/logger.js";

const PORT = config.port;

function logStartupInfo() {
  const baseUrl = `http://localhost:${PORT}`;
  logger.info("KMJ Billing System API started");
  logger.info(`Environment: ${config.env}`);
  logger.info(`Listening: ${baseUrl}`);
  logger.info(`API base: ${baseUrl}/api/${config.apiVersion}`);
  logger.info(`Health: ${baseUrl}/health`);
}

function createShutdownHandler(server, { reason, exitCode }) {
  let shuttingDown = false;

  return (err) => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (err) {
      logger.error(reason, err);
    } else {
      logger.info(reason);
    }

    server.close(() => {
      process.exit(exitCode);
    });

    // Failsafe to avoid hanging indefinitely on keep-alive connections.
    setTimeout(() => process.exit(exitCode), 10_000).unref();
  };
}

async function start() {
  try {
    initFirebase();

    const server = app.listen(PORT, logStartupInfo);

    server.on("error", (err) => {
      if (err?.code === "EADDRINUSE") {
        logger.error(`Port ${PORT} is already in use.`);
        process.exit(1);
      }
      logger.error("Server listen error", err);
      process.exit(1);
    });

    const shutdownOnSigterm = createShutdownHandler(server, {
      reason: "SIGTERM received; shutting down gracefully.",
      exitCode: 0,
    });
    const shutdownOnSigint = createShutdownHandler(server, {
      reason: "SIGINT received; shutting down gracefully.",
      exitCode: 0,
    });
    const shutdownOnUnhandledRejection = createShutdownHandler(server, {
      reason: "Unhandled promise rejection; shutting down.",
      exitCode: 1,
    });
    const shutdownOnUncaughtException = createShutdownHandler(server, {
      reason: "Uncaught exception; shutting down.",
      exitCode: 1,
    });

    process.once("SIGTERM", shutdownOnSigterm);
    process.once("SIGINT", shutdownOnSigint);
    process.once("unhandledRejection", shutdownOnUnhandledRejection);
    process.once("uncaughtException", shutdownOnUncaughtException);
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
}

await start();
