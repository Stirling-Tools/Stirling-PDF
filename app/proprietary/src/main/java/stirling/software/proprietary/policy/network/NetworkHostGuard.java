package stirling.software.proprietary.policy.network;

import java.net.InetAddress;
import java.net.UnknownHostException;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;

/**
 * Refuses a network source whose host resolves to a loopback, link-local, or private address,
 * unless the operator opts in via {@code policies.allowPrivateNetworkSources}. The host comes from
 * a portal user, so without this a connection could be aimed at internal services (the cloud
 * metadata address, an admin panel). Mirrors the S3 endpoint guard; enforced both at save time and
 * before every connect.
 */
@Component
@RequiredArgsConstructor
public class NetworkHostGuard {

    private final ApplicationProperties applicationProperties;

    public void requirePermitted(String host) {
        if (applicationProperties.getPolicies().isAllowPrivateNetworkSources()) {
            return;
        }
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("network source requires a host");
        }
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("cannot resolve network host '" + host + "'", e);
        }
        for (InetAddress address : addresses) {
            if (isPrivateOrLocal(address)) {
                throw new IllegalArgumentException(
                        "network host '"
                                + host
                                + "' resolves to a private or local address ("
                                + address.getHostAddress()
                                + "); set policies.allowPrivateNetworkSources=true to allow an"
                                + " on-network server");
            }
        }
    }

    private static boolean isPrivateOrLocal(InetAddress address) {
        return address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isAnyLocalAddress()
                || address.isMulticastAddress();
    }
}
