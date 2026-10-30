package stirling.software.proprietary.connectedaccount;

public enum CloudProvider {
    MICROSOFT("microsoft"),
    GOOGLE("google");

    private final String id;

    CloudProvider(String id) {
        this.id = id;
    }

    public String id() {
        return id;
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
