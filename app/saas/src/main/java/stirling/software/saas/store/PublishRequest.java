package stirling.software.saas.store;

import stirling.software.proprietary.policy.model.Policy;

/**
 * What the publish flow sends: which policy, and the listing text the publisher typed. The server
 * builds the manifest itself and never trusts a client-supplied one.
 *
 * <p>{@code policy} is for a pipeline this backend cannot read, one on a linked self-hosted server.
 * That server sends the pipeline with its secrets already blanked; it is used only when {@code
 * policyId} is not found here, and it goes through the same sanitiser and checks as a stored one.
 */
public record PublishRequest(
        String policyId,
        String name,
        String description,
        String category,
        String whatChanged,
        Policy policy) {

    public PublishRequest(
            String policyId, String name, String description, String category, String whatChanged) {
        this(policyId, name, description, category, whatChanged, null);
    }

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
