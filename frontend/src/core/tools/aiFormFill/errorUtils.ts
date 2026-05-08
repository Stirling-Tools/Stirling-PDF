/**
 * Shared error helpers for AI Form Fill — both the analyse hook and the
 * batch-fill hook used to define the same `describeError` inline.
 */

/**
 * Pull the most useful detail out of an axios/fetch error. FastAPI 422s come
 * back as `{detail: [{loc, msg, type}, ...]}`; plain HTTP errors carry
 * `{detail: string}` or `{message: string}`. Falls back to `e.message` and
 * finally to the supplied `fallback` string.
 */
export function describeError(err: unknown, fallback = 'Request failed.'): string {
  if (err && typeof err === 'object') {
    const e = err as {
      response?: { data?: unknown };
      message?: unknown;
    };
    const data = e.response?.data;
    if (data && typeof data === 'object') {
      const d = data as { detail?: unknown; message?: unknown };
      if (Array.isArray(d.detail)) {
        return d.detail
          .map((entry) => {
            const item = entry as { loc?: unknown; msg?: unknown; type?: unknown };
            const loc = Array.isArray(item.loc) ? item.loc.join('.') : '';
            return `${loc}: ${item.msg ?? item.type ?? ''}`;
          })
          .join('; ');
      }
      if (typeof d.detail === 'string') return d.detail;
      if (typeof d.message === 'string') return d.message;
    }
    if (typeof e.message === 'string') return e.message;
  }
  return fallback;
}
