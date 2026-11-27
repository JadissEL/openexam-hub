/**
 * Build an AbortSignal for browser fetch calls, with a default timeout.
 * Uses AbortSignal.timeout / AbortSignal.any when available, and falls back
 * to AbortController + setTimeout on older browsers.
 */
export const DEFAULT_API_TIMEOUT_MS = 60_000;

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const id = setTimeout(() => {
    try {
      const reason =
        typeof DOMException === 'function'
          ? new DOMException('The operation was aborted due to timeout', 'TimeoutError')
          : undefined;
      controller.abort(reason);
    } catch {
      controller.abort();
    }
  }, ms);
  if (typeof controller.signal.addEventListener === 'function') {
    controller.signal.addEventListener('abort', () => clearTimeout(id), { once: true });
  }
  return controller.signal;
}

function anySignal(signals) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals);
  }
  const controller = new AbortController();
  const abortFrom = (source) => {
    if (controller.signal.aborted) return;
    try {
      controller.abort(source && 'reason' in source ? source.reason : undefined);
    } catch {
      controller.abort();
    }
  };
  for (const source of signals) {
    if (!source) continue;
    if (source.aborted) {
      abortFrom(source);
      return controller.signal;
    }
    source.addEventListener('abort', () => abortFrom(source), { once: true });
  }
  return controller.signal;
}

/** Combine an optional caller signal with a timeout signal. */
export function requestSignal({ signal, timeoutMs = DEFAULT_API_TIMEOUT_MS } = {}) {
  const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const timeout = hasTimeout ? timeoutSignal(timeoutMs) : null;
  if (!signal && !timeout) return undefined;
  if (!signal) return timeout;
  if (!timeout) return signal;
  return anySignal([signal, timeout]);
}
