export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ ensureScrapeScheduler }, { ensureEmailScheduler }] = await Promise.all([import("@/lib/scraper"), import("@/lib/email")]);
    ensureScrapeScheduler();
    ensureEmailScheduler();
  }
}
