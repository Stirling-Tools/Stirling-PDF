package stirling.software.proprietary.policy.ledger;

import java.nio.charset.StandardCharsets;

import stirling.software.proprietary.billing.ContentHasher;

/**
 * Fixed-width key form of a source-owned identity, so any identity length fits the ledger's primary
 * key. Backend-agnostic: every source type's identities are keyed through here, which is why this
 * does not live with the folder backend's {@link FolderIdentities}.
 */
public final class IdentityHasher {

    private IdentityHasher() {}

    public static String identityHash(String identity) {
        return ContentHasher.sha256(identity.getBytes(StandardCharsets.UTF_8));
    }
}
