package stirling.software.proprietary.integration.api;

import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.cluster.s3.S3Clients;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.IntegrationConfigValidator;

/**
 * The {@code API} connection schema, enforced when the config is saved: an http(s) base URL, a
 * coherent auth block, and a host that must not reach private addresses without the operator
 * opt-in.
 *
 * <p>The host check runs here so a bad connection fails in the form rather than mid-run. It is not
 * the only check - {@link ExternalApiCaller} re-checks before dispatch, because DNS can be
 * re-pointed at a private address long after save time (a check-then-use gap this validator alone
 * cannot close).
 */
@Component
@RequiredArgsConstructor
public class ApiIntegrationValidator implements IntegrationConfigValidator {

    private final ApplicationProperties applicationProperties;

    @Override
    public IntegrationType type() {
        return IntegrationType.API;
    }

    @Override
    public void validate(Map<String, Object> config) {
        ApiConnectionSettings settings = ApiConnectionSettings.from(config);
        requirePublicHost(settings, applicationProperties, "API connection base URL");
    }

    /**
     * Shared by every integration type that dials an operator-supplied host, so they cannot drift
     * apart on what counts as reachable.
     */
    static void requirePublicHost(
            ApiConnectionSettings settings,
            ApplicationProperties applicationProperties,
            String settingName) {
        // Block the cloud metadata service unconditionally - before the opt-in check. The private-
        // endpoint opt-in exists for on-prem services (RFC1918, an internal gateway), but the
        // metadata endpoint is never a real integration and reaching it is the highest-value SSRF:
        // it hands out the instance's own IAM credentials. So it stays blocked even when the
        // operator has allowed private endpoints.
        denyCloudMetadata(settings.baseUri(), settingName);
        try {
            S3Clients.validateEndpointHost(
                    settings.baseUri(),
                    applicationProperties.getPolicies().isAllowPrivateApiEndpoints(),
                    settingName,
                    "set policies.allowPrivateApiEndpoints=true to opt in (e.g. for an on-prem"
                            + " integration).");
        } catch (IllegalStateException e) {
            throw new IllegalArgumentException(e.getMessage(), e);
        }
    }

    /** AWS/GCP/Azure, Oracle and IBM metadata addresses; mirrors {@code SsrfProtectionService}. */
    private static final java.util.Set<String> CLOUD_METADATA_IPS =
            java.util.Set.of(
                    "169.254.169.254", "169.254.169.253", "169.254.169.250", "fd00:ec2::254");

    private static void denyCloudMetadata(java.net.URI uri, String settingName) {
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            return; // a missing host is S3Clients' error to report, with its own message
        }
        java.net.InetAddress[] addresses;
        try {
            addresses = java.net.InetAddress.getAllByName(host);
        } catch (java.net.UnknownHostException e) {
            return; // an unresolvable host is likewise left to S3Clients to reject
        }
        for (java.net.InetAddress address : addresses) {
            String ip = normalise(address.getHostAddress());
            if (CLOUD_METADATA_IPS.stream().anyMatch(ip::startsWith)) {
                throw new IllegalArgumentException(
                        settingName
                                + " host '"
                                + host
                                + "' resolves to the cloud metadata service ("
                                + ip
                                + "), which is never a valid integration target.");
            }
        }
    }

    /** Strip an IPv4-mapped-IPv6 prefix and any zone id so the compare sees a bare address. */
    private static String normalise(String ip) {
        String out = ip;
        int zone = out.indexOf('%');
        if (zone >= 0) {
            out = out.substring(0, zone);
        }
        if (out.startsWith("::ffff:")) {
            out = out.substring(7);
        }
        return out;
    }
}
