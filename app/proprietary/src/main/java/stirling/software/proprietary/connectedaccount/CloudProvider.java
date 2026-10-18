package stirling.software.proprietary.connectedaccount;

/** The cloud storage providers a user can connect an account from. */
public enum CloudProvider {
    MICROSOFT("microsoft"),
    GOOGLE("google");

    private final String id;

    CloudProvider(String id) {
        this.id = id;
    }

    /** The stable id used in URLs and stored on {@link ConnectedAccount#getProvider()}. */
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
