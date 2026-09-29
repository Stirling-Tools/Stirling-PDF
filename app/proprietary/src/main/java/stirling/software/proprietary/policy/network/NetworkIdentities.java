package stirling.software.proprietary.policy.network;

/**
 * The network backend's identity and version scheme, shared by {@link NetworkInputSource} and its
 * completion hook. Identity keys a file's ledger row and stays stable across sweeps; the gate is
 * size + last-modified, since SFTP/FTP/SMB expose no ETag - the same "stat" strength as a folder
 * source, so a touch that changes mtime counts as a new version.
 */
public final class NetworkIdentities {

    private NetworkIdentities() {}

    /** A stable, unique key for a remote file: {@code protocol://host:port[/share]/path}. */
    public static String identity(NetworkConfig config, String path) {
        StringBuilder id =
                new StringBuilder(config.protocol().name().toLowerCase())
                        .append("://")
                        .append(config.host())
                        .append(':')
                        .append(config.port());
        if (config.share() != null && !config.share().isBlank()) {
            id.append('/').append(trimSlashes(config.share()));
        }
        id.append('/').append(trimLeadingSlash(path));
        return id.toString();
    }

    /** The version gate: size and last-modified, mirroring the folder source's stat identity. */
    public static String gate(long size, long lastModifiedMs) {
        return size + ":" + lastModifiedMs;
    }

    private static String trimSlashes(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && (value.charAt(start) == '/' || value.charAt(start) == '\\')) {
            start++;
        }
        while (end > start && (value.charAt(end - 1) == '/' || value.charAt(end - 1) == '\\')) {
            end--;
        }
        return value.substring(start, end);
    }

    private static String trimLeadingSlash(String value) {
        int start = 0;
        while (start < value.length() && value.charAt(start) == '/') {
            start++;
        }
        return value.substring(start);
    }
}
