package stirling.software.proprietary.policy.google;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import stirling.software.proprietary.policy.remote.CloudLocation;
import stirling.software.proprietary.policy.remote.LocationOptions;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

public record GoogleDriveConfig(
        Credential credential, String folder, boolean snapshot, boolean recursive)
        implements CloudLocation {

    public sealed interface Credential permits AccountCredential, ServiceAccountCredential {}

    public record AccountCredential(long accountId) implements Credential {}

    public record ServiceAccountCredential(String clientEmail, String privateKeyPem, String subject)
            implements Credential {
        @Override
        public String toString() {
            return "ServiceAccountCredential[clientEmail="
                    + clientEmail
                    + ", subject="
                    + subject
                    + "]";
        }
    }

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern FOLDER_LINK = Pattern.compile("/folders/([A-Za-z0-9_-]+)");
    private static final Pattern ID_QUERY = Pattern.compile("[?&]id=([A-Za-z0-9_-]+)");
    private static final Pattern BARE_ID = Pattern.compile("[A-Za-z0-9_-]{10,}");
    private static final Pattern EMAIL = Pattern.compile("[^@\\s]+@[^@\\s]+");

    public static GoogleDriveConfig forAccount(long accountId, Map<String, Object> options) {
        return new GoogleDriveConfig(
                new AccountCredential(accountId),
                folder(options.get("directory")),
                LocationOptions.snapshot(options),
                LocationOptions.recursive(options));
    }

    public static GoogleDriveConfig fromConnection(Map<String, Object> options) {
        return new GoogleDriveConfig(
                serviceAccount(options),
                folder(options.get("directory")),
                LocationOptions.snapshot(options),
                LocationOptions.recursive(options));
    }

    public static ServiceAccountCredential serviceAccount(Map<String, Object> options) {
        String json = LocationOptions.trimmed(options.get("credentialsJson"));
        if (json == null) {
            throw new IllegalArgumentException(
                    "paste the service account's JSON key into 'credentialsJson'");
        }
        JsonNode key;
        try {
            key = JSON.readTree(json);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("the service account key is not valid JSON");
        }
        String clientEmail = text(key, "client_email");
        String privateKey = text(key, "private_key");
        if (clientEmail == null || privateKey == null || !privateKey.contains("PRIVATE KEY")) {
            throw new IllegalArgumentException(
                    "the JSON key must be a service account key with client_email and private_key");
        }
        String subject = LocationOptions.trimmed(options.get("subject"));
        if (subject != null && !EMAIL.matcher(subject).matches()) {
            throw new IllegalArgumentException("'subject' must be the email of the user to act as");
        }
        return new ServiceAccountCredential(clientEmail, privateKey, subject);
    }

    public String folderId() {
        if (folder.isEmpty()) {
            return null;
        }
        if (folder.startsWith("https://")) {
            Matcher link = FOLDER_LINK.matcher(folder);
            if (link.find()) {
                return link.group(1);
            }
            Matcher query = ID_QUERY.matcher(folder);
            if (query.find()) {
                return query.group(1);
            }
            throw new IllegalArgumentException(
                    "that link does not name a Drive folder; open the folder and copy its link");
        }
        return !folder.contains("/") && BARE_ID.matcher(folder).matches() ? folder : null;
    }

    public String location() {
        String who =
                switch (credential) {
                    case AccountCredential account -> "account:" + account.accountId();
                    case ServiceAccountCredential service ->
                            service.clientEmail()
                                    + (service.subject() == null ? "" : " as " + service.subject());
                };
        return who + " folder:" + folder;
    }

    public GoogleDriveConfig withRecursive(boolean value) {
        return new GoogleDriveConfig(credential, folder, snapshot, value);
    }

    private static String folder(Object value) {
        String text = LocationOptions.trimmed(value);
        if (text == null) {
            return "";
        }
        if (text.regionMatches(true, 0, "https://", 0, 8)) {
            try {
                URI uri = new URI(text);
                if (uri.getHost() == null || uri.getUserInfo() != null) {
                    throw new IllegalArgumentException("folder link is not a valid URL");
                }
            } catch (URISyntaxException e) {
                throw new IllegalArgumentException("folder link is not a valid URL", e);
            }
            return text;
        }
        return LocationOptions.folderPath(text);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asString();
    }

    @Override
    public String toString() {
        return "GoogleDriveConfig[location="
                + location()
                + ", snapshot="
                + snapshot
                + ", recursive="
                + recursive
                + "]";
    }
}
