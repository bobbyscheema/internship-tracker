export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ ensureScrapeScheduler }, { ensureEmailScheduler }, { ensureEventScheduler }] = await Promise.all([import("@/lib/scraper"), import("@/lib/email"), import("@/lib/events")]);
    ensureScrapeScheduler();
    ensureEmailScheduler();
    ensureEventScheduler();
  }
}
