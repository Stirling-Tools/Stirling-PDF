package stirling.software.proprietary.policy.network;

import java.util.Map;

/**
 * The fully resolved settings a network source runs with - produced by {@link
 * NetworkConnectionResolver} merging a stored connection (protocol, host, credentials, and, for
 * SMB, the share) with per-use source options (directory, mode, recursive). Credentials are
 * required: there is no anonymous fallback, so a source can never reach a server without
 * config-supplied identity. {@code snapshot} and {@code recursive} are input-only.
 */
public record NetworkConfig(
        NetworkProtocol protocol,
        String host,
        int port,
        String username,
        String password,
        String privateKey,
        String privateKeyPassphrase,
        String hostKeyFingerprint,
        String domain,
        String share,
        FtpSecurity security,
        boolean passive,
        String directory,
        boolean snapshot,
        boolean recursive) {

    /** FTP transport security: plaintext, or TLS negotiated up-front (implicit) or via AUTH TLS. */
    public enum FtpSecurity {
        NONE,
        EXPLICIT,
        IMPLICIT;

        static FtpSecurity fromOption(String value) {
            if (value == null || value.isBlank()) {
                return NONE;
            }
            String normalized = value.trim().toUpperCase();
            for (FtpSecurity security : values()) {
                if (security.name().equals(normalized)) {
                    return security;
                }
            }
            throw new IllegalArgumentException("network config 'security' must be NONE, EXPLICIT or IMPLICIT");
        }
    }

    private static final String PROTOCOL_OPTION = "protocol";
    private static final String HOST_OPTION = "host";
    private static final String PORT_OPTION = "port";
    private static final String USERNAME_OPTION = "username";
    private static final String PASSWORD_OPTION = "password";
    private static final String PRIVATE_KEY_OPTION = "privateKey";
    private static final String PRIVATE_KEY_PASSPHRASE_OPTION = "privateKeyPassphrase";
    private static final String HOST_KEY_FINGERPRINT_OPTION = "hostKeyFingerprint";
    private static final String DOMAIN_OPTION = "domain";
    private static final String SHARE_OPTION = "share";
    private static final String SECURITY_OPTION = "security";
    private static final String PASSIVE_OPTION = "passive";
    private static final String DIRECTORY_OPTION = "directory";
    private static final String MODE_OPTION = "mode";
    private static final String MODE_CONSUME = "consume";
    private static final String MODE_SNAPSHOT = "snapshot";
    private static final String RECURSIVE_OPTION = "recursive";

    public static NetworkConfig from(Map<String, Object> options) {
        NetworkProtocol protocol = NetworkProtocol.fromOption(str(options.get(PROTOCOL_OPTION)));
        if (protocol == null) {
            throw new IllegalArgumentException("network config requires a 'protocol' of sftp, ftp or smb");
        }
        String host = trimmed(options.get(HOST_OPTION));
        if (host == null) {
            throw new IllegalArgumentException("network config requires a 'host'");
        }
        FtpSecurity security = FtpSecurity.fromOption(str(options.get(SECURITY_OPTION)));
        int port = port(options.get(PORT_OPTION), defaultPort(protocol, security));
        String username = trimmed(options.get(USERNAME_OPTION));
        if (username == null) {
            throw new IllegalArgumentException("network config requires a 'username'");
        }
        String password = trimmed(options.get(PASSWORD_OPTION));
        String privateKey = trimmed(options.get(PRIVATE_KEY_OPTION));
        String passphrase = trimmed(options.get(PRIVATE_KEY_PASSPHRASE_OPTION));
        String fingerprint = trimmed(options.get(HOST_KEY_FINGERPRINT_OPTION));
        String domain = trimmed(options.get(DOMAIN_OPTION));
        String share = trimmed(options.get(SHARE_OPTION));
        boolean passive = parseBoolean(options.get(PASSIVE_OPTION), true);
        String directory = directory(options.get(DIRECTORY_OPTION));
        boolean recursive = parseBoolean(options.get(RECURSIVE_OPTION), false);
        boolean snapshot = snapshot(str(options.get(MODE_OPTION)));

        if (protocol == NetworkProtocol.SFTP && password == null && privateKey == null) {
            throw new IllegalArgumentException("sftp connection requires a 'password' or a 'privateKey'");
        }
        if ((protocol == NetworkProtocol.FTP || protocol == NetworkProtocol.SMB) && password == null) {
            throw new IllegalArgumentException(protocol.name() + " connection requires a 'password'");
        }
        if (protocol == NetworkProtocol.SMB && share == null) {
            throw new IllegalArgumentException("smb connection requires a 'share' (e.g. documents)");
        }
        return new NetworkConfig(
                protocol,
                host,
                port,
                username,
                password,
                privateKey,
                passphrase,
                fingerprint,
                domain,
                share,
                security,
                passive,
                directory,
                snapshot,
                recursive);
    }

    /** Implicit FTPS listens on 990, not the plain-FTP 21. */
    private static int defaultPort(NetworkProtocol protocol, FtpSecurity security) {
        if (protocol == NetworkProtocol.FTP && security == FtpSecurity.IMPLICIT) {
            return 990;
        }
        return protocol.defaultPort();
    }

    private static int port(Object value, int fallback) {
        String text = trimmed(value);
        if (text == null) {
            return fallback;
        }
        int port;
        try {
            port = Integer.parseInt(text);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("network config 'port' must be a number");
        }
        if (port < 1 || port > 65535) {
            throw new IllegalArgumentException("network config 'port' must be between 1 and 65535");
        }
        return port;
    }

    /**
     * A poll directory relative to the login/home dir (SFTP/FTP) or the share root (SMB). Traversal
     * segments are rejected so a connection cannot be steered above where the operator scoped it.
     */
    private static String directory(Object value) {
        String text = trimmed(value);
        if (text == null) {
            return "";
        }
        String normalized = text.replace('\\', '/');
        if (normalized.indexOf('\0') >= 0) {
            throw new IllegalArgumentException("network config 'directory' contains a null byte");
        }
        for (String segment : normalized.split("/")) {
            if (segment.equals("..")) {
                throw new IllegalArgumentException("network config 'directory' must not contain '..'");
            }
        }
        return normalized;
    }

    private static boolean snapshot(String mode) {
        if (mode == null || mode.isBlank()) {
            return false;
        }
        if (!MODE_CONSUME.equals(mode) && !MODE_SNAPSHOT.equals(mode)) {
            throw new IllegalArgumentException("network config 'mode' must be 'consume' or 'snapshot'");
        }
        return MODE_SNAPSHOT.equals(mode);
    }

    private static boolean parseBoolean(Object value, boolean fallback) {
        String text = trimmed(value);
        return text == null ? fallback : Boolean.parseBoolean(text);
    }

    private static String str(Object value) {
        return value == null ? null : value.toString();
    }

    private static String trimmed(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    /** Never prints the credentials, so an accidental log line cannot leak them. */
    @Override
    public String toString() {
        return "NetworkConfig[protocol="
                + protocol
                + ", host="
                + host
                + ", port="
                + port
                + ", username="
                + username
                + ", share="
                + share
                + ", directory="
                + directory
                + ", snapshot="
                + snapshot
                + ", recursive="
                + recursive
                + "]";
    }
}
