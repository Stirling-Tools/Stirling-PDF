package stirling.software.proprietary.accountlink;

/**
 * Path scope of the account-link entitlement gate. Spring bound {@link
 * InstanceEntitlementInterceptor} to these patterns through an {@code InterceptorRegistry}; the
 * filter that replaces it is mapped to {@code /*} and handed every request, so it asks here
 * instead. Scoping still keeps the gate off the bulk of interactive endpoints; the interceptor
 * itself re-checks billability (and short-circuits manual tools).
 *
 * <p>The flag {@code stirling.billing.account-link.enabled} is read by the filter and by {@code
 * InstanceEntitlementGate} (allowing with {@code FLAG_OFF}), and {@code @IfBuildProfile("!saas")}
 * stays on the interceptor, so "off" is as inert as the absent config bean was.
 */
public final class AccountLinkWebMvcConfig {

    // AI surface is always billable; the broad /api/v1/** catch lets automation-marked manual calls
    // be gated too, while the interceptor lets genuine manual tools through.
    private static final String API_BASE = "/api/v1";

    // Linking must stay reachable on an unlinked instance, or an API-key admin could never link it.
    private static final String ACCOUNT_LINK_BASE = "/api/v1/account-link";

    private AccountLinkWebMvcConfig() {}

    /** The mapped surface: {@code /api/v1/**}, excluding {@code /api/v1/account-link/**}. */
    public static boolean isGated(String path) {
        // A servlet path always has one leading slash, UriInfo.getPath() may not; normalise both.
        String uri = "/" + (path == null ? "" : path).replaceAll("^/+", "");
        return underBase(uri, API_BASE) && !underBase(uri, ACCOUNT_LINK_BASE);
    }

    /**
     * Ant {@code base/**} semantics - the base itself or anything below it - segment-anchored so a
     * sibling like {@code /api/v1x} never matches, and tolerant of a deployment context path prefix
     * as {@code PolicyRunRoutes} is.
     */
    private static boolean underBase(String uri, String base) {
        int at = uri.indexOf(base);
        if (at < 0) {
            return false;
        }
        int end = at + base.length();
        return end == uri.length() || uri.charAt(end) == '/';
    }
}
