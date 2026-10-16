/** Abort must settle the caller even when a transport/auth lock ignores it. */
export function settleOnAbort<T>(operation: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'));
    if (signal.aborted) {
      // Consume any late rejection without accepting the result.
      Promise.resolve(operation).catch(() => {});
      aborted();
      return;
    }
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

export async function withRequestDeadline<T>(operation: (signal: AbortSignal) => PromiseLike<T>, ms: number, parent?: AbortSignal | null): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), ms);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    return await settleOnAbort(operation(controller.signal), controller.signal);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}
