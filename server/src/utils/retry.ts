export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES || "3", 10);
const DEFAULT_BASE_DELAY_MS = parseInt(process.env.LLM_RETRY_BASE_MS || "1000", 10);

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error && error.name === "LlmError") {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode != null) {
      return [429, 500, 502, 503].includes(statusCode);
    }
    // LlmError without statusCode (e.g. empty response) — do not retry
    return false;
  }

  // Network-level errors from fetch
  if (error instanceof TypeError) {
    return true;
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string }).code;
    if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_SOCKET"].includes(code)) {
      return true;
    }
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const shouldRetry = options?.shouldRetry ?? isRetryableError;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
      const reason = error instanceof Error ? error.message : String(error);
      console.warn("[LLM] Retry %d/%d after %dms: %s", attempt + 1, maxRetries, delay, reason);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
