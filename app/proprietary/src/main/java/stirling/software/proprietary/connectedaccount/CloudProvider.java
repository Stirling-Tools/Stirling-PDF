package stirling.software.proprietary.connectedaccount;

public enum CloudProvider {
    MICROSOFT("microsoft", "Microsoft"),
    GOOGLE("google", "Google");

    private final String id;
    private final String displayName;

    CloudProvider(String id, String displayName) {
        this.id = id;
        this.displayName = displayName;
    }

    public String id() {
        return id;
    }

    public String displayName() {
        return displayName;
    }

    public static CloudProvider fromId(String id) {
        for (CloudProvider provider : values()) {
            if (provider.id.equalsIgnoreCase(id)) {
                return provider;
            }
        }
        throw new IllegalArgumentException("unknown provider '" + id + "'");
    }
}
