const RETRYABLE = /Response from the Engine was empty|ECONNRESET|ETIMEDOUT|Connection terminated|Can't reach database server/i;

export async function withPrismaRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!RETRYABLE.test(msg) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw lastError;
}
