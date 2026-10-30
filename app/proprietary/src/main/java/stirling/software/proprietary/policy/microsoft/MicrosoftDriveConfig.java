package stirling.software.proprietary.policy.microsoft;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Map;
import java.util.regex.Pattern;

import stirling.software.proprietary.policy.remote.CloudLocation;
import stirling.software.proprietary.policy.remote.LocationOptions;

public record MicrosoftDriveConfig(
        MicrosoftDrive drive,
        Credential credential,
        String user,
        String siteHost,
        String sitePath,
        String library,
        String folderLink,
        String directory,
        boolean snapshot,
        boolean recursive)
        implements CloudLocation {

    public sealed interface Credential permits AppCredential, AccountCredential {}

    public record AppCredential(String tenantId, String clientId, String clientSecret)
            implements Credential {
        @Override
        public String toString() {
            return "AppCredential[tenantId=" + tenantId + ", clientId=" + clientId + "]";
        }
    }

    public record AccountCredential(long accountId) implements Credential {}

    public record AppDefaults(String tenant, String clientId, String clientSecret) {
        public static final AppDefaults NONE = new AppDefaults(null, null, null);
    }

    private static final Pattern TENANT = Pattern.compile("[A-Za-z0-9][A-Za-z0-9.-]{0,252}");
    private static final Pattern USER = Pattern.compile("[^/\\\\?#\\s]{1,256}");

    public static MicrosoftDriveConfig fromConnection(
            Map<String, Object> options, AppDefaults defaults) {
        MicrosoftDrive drive = requireDrive(options);
        AppCredential credential =
                new AppCredential(
                        tenant(options, defaults),
                        orDefault(options, "clientId", defaults.clientId()),
                        orDefault(options, "clientSecret", defaults.clientSecret()));

        String user = null;
        String siteHost = null;
        String sitePath = null;
        String library = null;
        if (drive == MicrosoftDrive.ONEDRIVE) {
            user = required(options, "user");
            if (!USER.matcher(user).matches()) {
                throw new IllegalArgumentException(
                        "OneDrive 'user' must be a user principal name such as"
                                + " finance@contoso.com, or a user object ID");
            }
        } else {
            URI site = httpsUrl(required(options, "siteUrl"), "SharePoint 'siteUrl'");
            if (site.getRawQuery() != null || site.getRawFragment() != null) {
                throw new IllegalArgumentException(
                        "SharePoint 'siteUrl' must look like"
                                + " https://contoso.sharepoint.com/sites/Finance");
            }
            siteHost = site.getHost();
            sitePath = trimSlashes(site.getPath() == null ? "" : site.getPath());
            library = LocationOptions.trimmed(options.get("library"));
        }
        Folder folder = folder(options.get("directory"));
        return new MicrosoftDriveConfig(
                drive,
                credential,
                user,
                siteHost,
                sitePath,
                library,
                folder.link(),
                folder.path(),
                LocationOptions.snapshot(options),
                LocationOptions.recursive(options));
    }

    public static MicrosoftDriveConfig forAccount(
            MicrosoftDrive drive, long accountId, Map<String, Object> options) {
        Folder folder = folder(options.get("directory"));
        if (drive == MicrosoftDrive.SHAREPOINT && folder.link() == null) {
            throw new IllegalArgumentException(
                    "paste a link to the SharePoint folder (Copy link in SharePoint)");
        }
        return new MicrosoftDriveConfig(
                drive,
                new AccountCredential(accountId),
                null,
                null,
                null,
                null,
                folder.link(),
                folder.path(),
                LocationOptions.snapshot(options),
                LocationOptions.recursive(options));
    }

    public String location() {
        StringBuilder label = new StringBuilder();
        if (credential instanceof AccountCredential account) {
            label.append("account:").append(account.accountId());
        } else if (drive == MicrosoftDrive.ONEDRIVE) {
            label.append(((AppCredential) credential).tenantId()).append(":onedrive:").append(user);
        } else {
            label.append(((AppCredential) credential).tenantId())
                    .append(":sharepoint:")
                    .append(siteHost)
                    .append(sitePath.isEmpty() ? "" : "/" + sitePath)
                    .append(library == null ? "" : "#" + library);
        }
        if (folderLink != null) {
            label.append(" link:").append(folderLink);
        }
        return label.toString();
    }

    public MicrosoftDriveConfig withRecursive(boolean value) {
        return new MicrosoftDriveConfig(
                drive,
                credential,
                user,
                siteHost,
                sitePath,
                library,
                folderLink,
                directory,
                snapshot,
                value);
    }

    private record Folder(String link, String path) {}

    private static Folder folder(Object value) {
        String text = LocationOptions.trimmed(value);
        if (text == null) {
            return new Folder(null, "");
        }
        if (text.regionMatches(true, 0, "https://", 0, 8)) {
            return new Folder(httpsUrl(text, "folder link").toString(), "");
        }
        return new Folder(null, directory(text));
    }

    private static MicrosoftDrive requireDrive(Map<String, Object> options) {
        MicrosoftDrive drive =
                MicrosoftDrive.fromOption(LocationOptions.trimmed(options.get("drive")));
        if (drive == null) {
            throw new IllegalArgumentException(
                    "Microsoft 365 connection requires a 'drive' of onedrive or sharepoint");
        }
        return drive;
    }

    private static String tenant(Map<String, Object> options, AppDefaults defaults) {
        String tenant = LocationOptions.trimmed(options.get("tenantId"));
        if (tenant == null && defaults.tenant() != null && isSpecificTenant(defaults.tenant())) {
            tenant = defaults.tenant().trim();
        }
        if (tenant == null) {
            throw new IllegalArgumentException(
                    "Microsoft 365 connection requires a 'tenantId' (directory ID or domain)");
        }
        if (!TENANT.matcher(tenant).matches() || !isSpecificTenant(tenant)) {
            throw new IllegalArgumentException(
                    "Microsoft 365 'tenantId' must be a directory (tenant) ID or a domain such as"
                            + " contoso.onmicrosoft.com");
        }
        return tenant;
    }

    static boolean isSpecificTenant(String tenant) {
        String value = tenant.trim().toLowerCase();
        return !value.isEmpty()
                && !value.equals("common")
                && !value.equals("organizations")
                && !value.equals("consumers");
    }

    private static String orDefault(Map<String, Object> options, String key, String fallback) {
        String value = LocationOptions.trimmed(options.get(key));
        if (value == null) {
            value = LocationOptions.trimmed(fallback);
        }
        if (value == null) {
            throw new IllegalArgumentException(
                    "Microsoft 365 connection requires a '"
                            + key
                            + "', or the server's Microsoft app must be set up in Settings");
        }
        return value;
    }

    private static URI httpsUrl(String value, String label) {
        URI uri;
        try {
            uri = new URI(value);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException(label + " is not a valid URL", e);
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getPort() != -1) {
            throw new IllegalArgumentException(label + " must be an https:// link");
        }
        return uri;
    }

    private static String directory(String text) {
        if (text.indexOf(':') >= 0) {
            throw new IllegalArgumentException("folder contains a character OneDrive rejects");
        }
        return LocationOptions.folderPath(text);
    }

    private static String required(Map<String, Object> options, String key) {
        String value = LocationOptions.trimmed(options.get(key));
        if (value == null) {
            throw new IllegalArgumentException("Microsoft 365 connection requires a '" + key + "'");
        }
        return value;
    }

    static String trimSlashes(String value) {
        return LocationOptions.trimSlashes(value);
    }

    @Override
    public String toString() {
        return "MicrosoftDriveConfig[location="
                + location()
                + ", credential="
                + credential
                + ", directory="
                + directory
                + ", snapshot="
                + snapshot
                + ", recursive="
                + recursive
                + "]";
    }
}
