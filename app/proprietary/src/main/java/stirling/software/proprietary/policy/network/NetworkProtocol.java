package stirling.software.proprietary.policy.network;

/**
 * The file-transfer protocols a network source speaks. Each maps to a {@link RemoteFileClient}
 * implementation and to a portal source type: {@code sftp} -> SFTP, {@code ftp} -> FTP/FTPS, {@code
 * network} -> SMB (a Windows/Samba share). The stored connection carries the protocol; the source
 * type only routes the UI.
 */
public enum NetworkProtocol {
    SFTP(22, "sftp"),
    FTP(21, "ftp"),
    SMB(445, "network");

    private final int defaultPort;
    private final String sourceType;

    NetworkProtocol(int defaultPort, String sourceType) {
        this.defaultPort = defaultPort;
        this.sourceType = sourceType;
    }

    public int defaultPort() {
        return defaultPort;
    }

    /** The portal source {@code type} string this protocol backs. */
    public String sourceType() {
        return sourceType;
    }

    /** Parse a stored {@code protocol} option (case-insensitive), or null when absent/unknown. */
    public static NetworkProtocol fromOption(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim().toUpperCase();
        for (NetworkProtocol protocol : values()) {
            if (protocol.name().equals(normalized)) {
                return protocol;
            }
        }
        return null;
    }

    /** The protocol a source {@code type} string implies, or null when it is not a network type. */
    public static NetworkProtocol forSourceType(String type) {
        if (type == null) {
            return null;
        }
        for (NetworkProtocol protocol : values()) {
            if (protocol.sourceType.equals(type)) {
                return protocol;
            }
        }
        return null;
    }
}
