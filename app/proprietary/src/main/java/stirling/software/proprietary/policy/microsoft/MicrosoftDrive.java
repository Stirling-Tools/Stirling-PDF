package stirling.software.proprietary.policy.microsoft;

/**
 * The kinds of Microsoft 365 document library a connection can point at. Each is both the stored
 * connection's {@code drive} option and the portal source {@code type} it backs.
 */
public enum MicrosoftDrive {
    ONEDRIVE("onedrive"),
    SHAREPOINT("sharepoint");

    private final String sourceType;

    MicrosoftDrive(String sourceType) {
        this.sourceType = sourceType;
    }

    public String sourceType() {
        return sourceType;
    }

    /** The drive a source {@code type} or stored {@code drive} option names, or null. */
    public static MicrosoftDrive fromOption(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim().toLowerCase();
        for (MicrosoftDrive drive : values()) {
            if (drive.sourceType.equals(normalized)) {
                return drive;
            }
        }
        return null;
    }
}
