package stirling.software.common.util;

import java.util.Set;

/**
 * Which API a guest may reach while login is switched on ({@code security.allowAnonymousAccess}).
 *
 * <p>Two lists, and the order they are consulted in, are the whole policy:
 *
 * <ul>
 *   <li>{@link #ACCOUNT_SCOPED_PREFIXES} is the default answer - everything a signed-in account
 *       owns (administration, stored files, teams, users, keys, audit, AI) stays shut.
 *   <li>{@link #GUEST_API} is the exception - the document tools everyone gets, plus the
 *       read-only configuration and copy the shell needs before anyone signs in.
 * </ul>
 *
 * <p>A path is consulted against the account-scoped list <em>first</em>, so a route that lands
 * under both trees ({@code /api/v1/storage/share-links}, {@code /api/v1/workflow/participant})
 * stays shut unless it is also token-gated, which is checked before either list.
 *
 * <p>Keeping this in one file makes the surface auditable: adding a route to a guest-open tree
 * opens it, and adding a new tree opens nothing until it appears here.
 */
public final class GuestApiPolicy {

    private GuestApiPolicy() {}

    /** API trees the file tools live under, plus what the shell reads before sign-in. */
    private static final String[] GUEST_API = {
        // Document tools.
        "/api/v1/general",
        "/api/v1/misc",
        "/api/v1/convert",
        "/api/v1/filter",
        "/api/v1/security",
        "/api/v1/form",
        "/api/v1/analysis",
        "/api/v1/pipeline",
        // Configuration, status, and the legal/UI copy the shell renders.
        "/api/v1/config",
        "/api/v1/info",
        "/api/v1/settings",
        "/api/v1/ui-data",
        "/api/v1/proprietary/ui-data",
        // The phone half of the QR scanner and signer.
        "/api/v1/mobile-scanner"
    };

    /** API trees that belong to an account. Consulted first, so they always win. */
    private static final String[] ACCOUNT_SCOPED_PREFIXES = {
        "/api/v1/admin",
        "/api/v1/auth/me",
        "/api/v1/auth/mfa",
        "/api/v1/user",
        "/api/v1/users",
        "/api/v1/account",
        "/api/v1/account-link",
        "/api/v1/team",
        "/api/v1/storage",
        "/api/v1/invite",
        "/api/v1/audit",
        "/api/v1/usage",
        "/api/v1/ai",
        "/api/v1/docparse",
        "/api/v1/integrations",
        "/api/v1/integration",
        "/api/v1/policies",
        "/api/v1/processing-folders",
        "/api/v1/sources",
        "/api/v1/notifications",
        "/api/v1/file-run-events",
        "/api/v1/automation",
        "/api/v1/database",
        "/api/v1/payg",
        "/api/v1/procurement",
        "/api/v1/proprietary/signatures",
        "/api/v1/ownership",
        "/api/v1/quarantine",
        "/api/v1/workflow/signing"
    };

    /**
     * Token-gated routes a guest legitimately follows from a share link or an invite. No account
     * is involved: the token in the URL is the credential.
     */
    private static final Set<String> TOKEN_GATED_PREFIXES =
            Set.of("/api/v1/storage/share-links", "/api/v1/workflow/participant");

    /**
     * Whether a context-relative path (already stripped of any context path) may be called by a
     * guest. Prefix matching is on path segments, so {@code /api/v1/general} does not open
     * {@code /api/v1/generally-speaking}.
     */
    public static boolean allowsGuest(String trimmedUri) {
        if (trimmedUri == null || !trimmedUri.startsWith("/api/")) {
            return false;
        }

        for (String prefix : TOKEN_GATED_PREFIXES) {
            if (matchesPrefix(trimmedUri, prefix)) {
                return true;
            }
        }

        for (String prefix : ACCOUNT_SCOPED_PREFIXES) {
            if (matchesPrefix(trimmedUri, prefix)) {
                return false;
            }
        }

        for (String prefix : GUEST_API) {
            if (matchesPrefix(trimmedUri, prefix)) {
                return true;
            }
        }

        return false;
    }

    private static boolean matchesPrefix(String uri, String prefix) {
        return uri.equals(prefix) || uri.startsWith(prefix + "/");
    }
}
