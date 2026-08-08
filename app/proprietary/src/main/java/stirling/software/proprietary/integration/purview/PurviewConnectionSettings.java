package stirling.software.proprietary.integration.purview;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * A Microsoft Purview tenant connection.
 *
 * <p>Only {@code tenantId} is required, because labelling a document needs nothing else: a label is
 * a set of key/value pairs and the tenant id is the {@code SiteId} among them. No call to Microsoft
 * is involved, so the step works with no network and no app registration.
 *
 * <p>The app-registration fields are optional and buy exactly one thing: reading the tenant's label
 * taxonomy from Graph, so the UI can offer a list of labels instead of asking someone to paste a
 * GUID. They are not needed to apply or read a label. Graph cannot apply labels for an application
 * anyway - "application permissions are not supported when updating assignedLabels" - which is why
 * labelling here goes through the published metadata contract instead.
 */
public record PurviewConnectionSettings(
        String tenantId,
        String clientId,
        String clientSecret,
        String graphBaseUrl,
        String loginBaseUrl) {

    static final String TENANT_ID_OPTION = "tenantId";
    static final String CLIENT_ID_OPTION = "clientId";
    // Contains a SecretMasker hint, so it masks on read and merges on update.
    static final String CLIENT_SECRET_OPTION = "clientSecret";
    static final String GRAPH_BASE_URL_OPTION = "graphBaseUrl";
    static final String LOGIN_BASE_URL_OPTION = "loginBaseUrl";

    public static final String DEFAULT_GRAPH_BASE_URL = "https://graph.microsoft.com";
    public static final String DEFAULT_LOGIN_BASE_URL = "https://login.microsoftonline.com";

    /** Entra tenant ids are GUIDs; the value ends up in document metadata, so it is checked. */
    private static final Pattern GUID =
            Pattern.compile("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$");

    public static PurviewConnectionSettings from(Map<String, Object> options) {
        String tenantId = trimmed(options.get(TENANT_ID_OPTION));
        if (tenantId == null) {
            throw new IllegalArgumentException("purview config requires a 'tenantId'");
        }
        if (!GUID.matcher(tenantId).matches()) {
            throw new IllegalArgumentException(
                    "purview config 'tenantId' must be a GUID, e.g."
                            + " cb46c030-1825-4e81-a295-151c039dbf02");
        }
        String clientId = trimmed(options.get(CLIENT_ID_OPTION));
        String clientSecret = trimmed(options.get(CLIENT_SECRET_OPTION));
        // Half an app registration would fail only when someone opened the label picker, which is
        // a confusing place to discover it.
        if ((clientId == null) != (clientSecret == null)) {
            throw new IllegalArgumentException(
                    "purview config needs both 'clientId' and 'clientSecret' to read the label"
                            + " list, or neither");
        }
        return new PurviewConnectionSettings(
                tenantId.toLowerCase(Locale.ROOT),
                clientId,
                clientSecret,
                orDefault(trimmed(options.get(GRAPH_BASE_URL_OPTION)), DEFAULT_GRAPH_BASE_URL),
                orDefault(trimmed(options.get(LOGIN_BASE_URL_OPTION)), DEFAULT_LOGIN_BASE_URL));
    }

    /** Whether this connection can read the tenant's label taxonomy from Graph. */
    public boolean canListLabels() {
        return clientId != null && clientSecret != null;
    }

    private static String orDefault(String value, String fallback) {
        return value == null ? fallback : value;
    }

    private static String trimmed(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    /** Never prints the client secret, so an accidental log line cannot leak it. */
    @Override
    public String toString() {
        return "PurviewConnectionSettings[tenantId="
                + tenantId
                + ", canListLabels="
                + canListLabels()
                + "]";
    }
}
