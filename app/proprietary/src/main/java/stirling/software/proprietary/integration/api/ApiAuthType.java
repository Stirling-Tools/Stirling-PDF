package stirling.software.proprietary.integration.api;

/**
 * How an {@link stirling.software.proprietary.integration.model.IntegrationType#API} connection
 * authenticates.
 */
public enum ApiAuthType {
    /** No credentials; the endpoint is open or authorises by network position. */
    NONE,
    /** {@code Authorization: Bearer <token>}. */
    BEARER,
    /** {@code Authorization: Basic base64(username:password)}. */
    BASIC,
    /** The token in a caller-named header, e.g. {@code X-API-Key: <token>}. */
    HEADER,
    /**
     * The connection logs in first and reuses the short-lived token it gets back.
     *
     * <p>For the large class of enterprise APIs - ConsignO Cloud, OAuth2 client-credentials, and
     * others - where credentials buy a token rather than authenticating a call directly. Without
     * this a step could not reach them at all: each call needs a token, and a stateless step has
     * nowhere to obtain or keep one. See {@link ApiTokenLogin}.
     */
    TOKEN_LOGIN
}
