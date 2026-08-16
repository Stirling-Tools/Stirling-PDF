/**
 * Endpoints that must be served by the machine the user is sitting at, whatever
 * backend the app is otherwise talking to.
 *
 * Ordinary tool endpoints are interchangeable: a merge or an OCR gives the same
 * answer wherever it runs, so the desktop is free to send them to a self-hosted
 * server. These are not. Enumerating the Windows certificate store, or signing
 * with a key held by a USB token, only means anything on the device holding
 * them - a remote server would answer about its own machine, or about nothing.
 *
 * The list lives here, in the feature's own layer, because the feature is what
 * knows this: the routing layer should not have to keep a catalogue of which
 * tools happen to need local hardware.
 */
export const DEVICE_LOCAL_ENDPOINTS: readonly RegExp[] = [
  // Hardware-backed signing: capabilities, certificate enumeration, PKCS#11.
  /^\/api\/v1\/security\/cert-sign\/hardware\//,
];

/**
 * Whether a request path must be served locally.
 *
 * @param url request path, relative and starting with `/api/...`
 */
export function isDeviceLocalEndpoint(url?: string): boolean {
  if (!url) return false;
  return DEVICE_LOCAL_ENDPOINTS.some((pattern) => pattern.test(url));
}

/**
 * Axios config flag for requests whose path cannot say it on its own.
 *
 * Signing posts to `/api/v1/security/cert-sign` whether the key came from an
 * uploaded keystore or from the device, so the path alone cannot decide where
 * it runs - only the chosen certificate type can. A caller marks the request
 * and the desktop router honours it; other flavours ignore it and nothing
 * changes for them.
 */
export type DeviceLocalRequestConfig = {
  deviceLocal?: boolean;
};

/** Config marking a request as one that must run on the user's own machine. */
export const DEVICE_LOCAL_REQUEST: DeviceLocalRequestConfig = {
  deviceLocal: true,
};
