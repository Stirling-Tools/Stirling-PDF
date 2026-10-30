package stirling.software.proprietary.policy.microsoft;

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
