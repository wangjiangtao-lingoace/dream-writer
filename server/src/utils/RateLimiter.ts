/**
 * Per-provider token bucket rate limiter.
 * Zero dependencies. Singleton pattern for global coordination.
 */

interface BucketState {
  tokens: number;
  lastRefillTime: number;
  rpm: number;
  pausedUntil: number;
}

export class RateLimiter {
  private buckets = new Map<string, BucketState>();

  /**
   * Acquire a rate limit token for the given provider.
   * Blocks if the bucket is empty or paused due to 429.
   * @param provider - Provider key (e.g. "deepseek", "openai")
   * @param rpmHint - Default RPM if bucket doesn't exist yet (from provider config)
   */
  async acquire(provider: string, rpmHint?: number): Promise<void> {
    const bucket = this.getOrCreateBucket(provider, rpmHint);
    if (bucket.rpm === 0) return; // unlimited

    this.refill(bucket);

    // Wait if paused (429 backoff)
    if (bucket.pausedUntil > Date.now()) {
      await sleep(bucket.pausedUntil - Date.now());
      this.refill(bucket);
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    // Calculate wait time for 1 token
    const waitMs = ((1 - bucket.tokens) / (bucket.rpm / 60000));
    await sleep(waitMs);
    bucket.tokens = Math.max(0, bucket.tokens - 1);
  }

  /**
   * Report a 429 response to pause the bucket.
   */
  report429(provider: string, retryAfterSeconds?: number): void {
    const bucket = this.getOrCreateBucket(provider);
    const pauseMs = (retryAfterSeconds ?? 10) * 1000;
    bucket.pausedUntil = Date.now() + pauseMs;
    bucket.tokens = 0;
  }

  /**
   * Get stats for all buckets (for health endpoint).
   */
  getStats(): Record<string, { rpm: number; tokens: number; paused: boolean }> {
    const stats: Record<string, { rpm: number; tokens: number; paused: boolean }> = {};
    for (const [provider, bucket] of this.buckets) {
      stats[provider] = {
        rpm: bucket.rpm,
        tokens: Math.round(bucket.tokens * 100) / 100,
        paused: bucket.pausedUntil > Date.now(),
      };
    }
    return stats;
  }

  private getOrCreateBucket(provider: string, rpmHint?: number): BucketState {
    let bucket = this.buckets.get(provider);
    if (!bucket) {
      const rpm = this.resolveRpm(provider, rpmHint);
      bucket = { tokens: rpm, lastRefillTime: Date.now(), rpm, pausedUntil: 0 };
      this.buckets.set(provider, bucket);
    }
    return bucket;
  }

  private resolveRpm(provider: string, rpmHint?: number): number {
    // Env var: {PROVIDER}_RPM (e.g., DEEPSEEK_RPM)
    const envKey = `${provider.toUpperCase()}_RPM`;
    const envVal = process.env[envKey];
    if (envVal !== undefined) return parseInt(envVal, 10) || 0;

    // DEFAULT_RPM env var
    const defaultEnv = process.env.DEFAULT_RPM;
    if (defaultEnv !== undefined) return parseInt(defaultEnv, 10) || 0;

    // Hint from provider config
    if (rpmHint !== undefined) return rpmHint;

    return 60;
  }

  private refill(bucket: BucketState): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefillTime;
    if (elapsed <= 0) return;
    bucket.tokens = Math.min(bucket.rpm, bucket.tokens + elapsed * (bucket.rpm / 60000));
    bucket.lastRefillTime = now;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const rateLimiter = new RateLimiter();
