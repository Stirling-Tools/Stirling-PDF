import {
  CanceledError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

/**
 * Works around WebKit sending a File as an empty request body (Content-Length: 0), which the
 * backend reports as "unexpected EOF in PREAMBLE". It hits files restored from IndexedDB and
 * files picked from disk alike, in Safari and in every browser built on WebKit: DuckDuckGo on
 * macOS and all iOS browsers. An in-memory copy of the bytes always uploads. Fixed upstream in
 * WebKit 323318@main (https://bugs.webkit.org/show_bug.cgi?id=319985); harmless once fixed,
 * since a copy is an ordinary in-memory file.
 */

const DESKTOP_COPY_BUDGET_BYTES = 512 * 1024 * 1024;
// iOS kills a tab well short of 1 GB on many devices, and the copy sits beside the original.
const TOUCH_COPY_BUDGET_BYTES = 192 * 1024 * 1024;

const inMemoryCopies = new WeakSet<FormData>();

export function uploadsNeedInMemoryFiles(userAgent: string): boolean {
  return /AppleWebKit/.test(userAgent) && !/Chrome\//.test(userAgent);
}

/** iPadOS reports a desktop Safari user agent, so touch support is what tells it apart. */
export function copyBudgetBytes(maxTouchPoints: number): number {
  return maxTouchPoints > 1
    ? TOUCH_COPY_BUDGET_BYTES
    : DESKTOP_COPY_BUDGET_BYTES;
}

/**
 * A copy of `form` with files read into memory, in entry order, until their combined size would
 * pass `budgetBytes`. Files past the budget are re-wrapped instead of copied: the WebKit bug
 * thread reports a fresh File over the same bytes uploading correctly, which costs no memory but
 * has not been confirmed here. String fields are kept as they are.
 */
export async function inMemoryFormData(
  form: FormData,
  budgetBytes: number,
  throwIfCancelled: () => void = () => {},
): Promise<FormData> {
  const copy = new FormData();
  let remaining = budgetBytes;
  for (const [key, value] of form.entries()) {
    throwIfCancelled();
    if (typeof value === "string") {
      copy.append(key, value);
      continue;
    }
    const options = { type: value.type, lastModified: value.lastModified };
    if (value.size > remaining) {
      copy.append(
        key,
        new File([value.slice(0, value.size, value.type)], value.name, options),
      );
      continue;
    }
    remaining -= value.size;
    copy.append(
      key,
      new File([await value.arrayBuffer()], value.name, options),
    );
  }
  throwIfCancelled();
  inMemoryCopies.add(copy);
  return copy;
}

function thisBrowserNeedsInMemoryFiles(): boolean {
  return (
    typeof navigator !== "undefined" &&
    uploadsNeedInMemoryFiles(navigator.userAgent)
  );
}

function inMemoryFormDataForThisDevice(
  form: FormData,
  throwIfCancelled?: () => void,
): Promise<FormData> {
  return inMemoryFormData(
    form,
    copyBudgetBytes(navigator.maxTouchPoints ?? 0),
    throwIfCancelled,
  );
}

function throwIfRequestCancelled(config: InternalAxiosRequestConfig): void {
  config.cancelToken?.throwIfRequested();
  if (config.signal?.aborted) throw new CanceledError(undefined, config);
}

/**
 * The form to send from this browser: `form` itself outside WebKit, otherwise its in-memory copy.
 * For uploads that bypass the API clients, such as a raw `fetch`.
 */
export async function uploadSafeFormData(form: FormData): Promise<FormData> {
  return thisBrowserNeedsInMemoryFiles()
    ? inMemoryFormDataForThisDevice(form)
    : form;
}

/**
 * Makes every FormData request `client` sends upload-safe. Installs nothing outside WebKit, so
 * other browsers keep streaming the original file. Install it last: axios runs the most recently
 * added request interceptor first, so the copy is in place before auth or any other interceptor.
 */
export function installInMemoryUploads(
  client: Pick<AxiosInstance, "interceptors">,
): void {
  if (!thisBrowserNeedsInMemoryFiles()) return;
  client.interceptors.request.use(async (config) =>
    config.data instanceof FormData && !inMemoryCopies.has(config.data)
      ? {
          ...config,
          data: await inMemoryFormDataForThisDevice(config.data, () =>
            throwIfRequestCancelled(config),
          ),
        }
      : config,
  );
}
