/**
 * Next.js instrumentation hook. Runs once when the Node server starts.
 * Starts the hourly automatic-backup scheduler.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return;
  }
  const { getDb } = await import("./lib/db");
  const { startBackupScheduler } = await import("./lib/backup");
  startBackupScheduler(getDb());
}
