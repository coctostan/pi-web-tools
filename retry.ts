export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
        },
        { once: true }
      );
    }
  });
}

export async function retryFetch(
  input: string | URL | Request,
  init?: RequestInit,
  config?: RetryConfig
): Promise<Response> {
  const maxRetries = config?.maxRetries ?? 2;
  const initialDelayMs = config?.initialDelayMs ?? 1000;
  const signal = init?.signal ?? undefined;

  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  }

  let lastResponse: Response | undefined;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
      await delay(delayMs, signal);
    }

    try {
      const response = await fetch(input, init);

      if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
        return response;
      }

      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries) {
        lastResponse = response;
        continue;
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxRetries) {
        throw lastError;
      }

      const isNetworkError =
        lastError instanceof TypeError &&
        (lastError.message.includes("fetch failed") ||
         lastError.message.includes("ECONNRESET") ||
         lastError.message.includes("ETIMEDOUT"));

      if (!isNetworkError) {
        throw lastError;
      }
    }
  }

  return lastResponse!;
}
