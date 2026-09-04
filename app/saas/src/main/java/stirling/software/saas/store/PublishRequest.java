package stirling.software.saas.store;

/**
 * What the publish flow sends: which policy, and the listing text the publisher typed. The server
 * re-reads the policy itself and never trusts a client-supplied manifest.
 */
public record PublishRequest(
        String policyId, String name, String description, String category, String whatChanged) {

    public String trimmedName() {
        return name == null ? "" : name.trim();
    }

    public String trimmedDescription() {
        return description == null ? "" : description.trim();
    }

    public String trimmedWhatChanged() {
        return whatChanged == null || whatChanged.isBlank() ? null : whatChanged.trim();
    }
}
