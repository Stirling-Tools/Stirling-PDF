package stirling.software.common.service;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.RegexPatternUtils;

@Service
@RequiredArgsConstructor
@Slf4j
public class SsrfProtectionService {

    private final ApplicationProperties applicationProperties;

    private static final Pattern DATA_URL_PATTERN =
            RegexPatternUtils.getInstance().getPattern("^data:.*", Pattern.CASE_INSENSITIVE);
    private static final Pattern FRAGMENT_PATTERN =
            RegexPatternUtils.getInstance().getPattern("^#.*");

    public enum SsrfProtectionLevel {
        OFF, // No SSRF protection - allows all URLs
        MEDIUM, // Block internal networks but allow external URLs
        MAX // Block all external URLs - only data: and fragments
    }

    public boolean isUrlAllowed(String url) {
        ApplicationProperties.Html.UrlSecurity config =
                applicationProperties.getSystem().getHtml().getUrlSecurity();

        if (!config.isEnabled()) {
            return true;
        }

        if (url == null || url.trim().isEmpty()) {
            return false;
        }

        String trimmedUrl = url.trim();

        // Always allow data URLs and fragments
        if (DATA_URL_PATTERN.matcher(trimmedUrl).matches()
                || FRAGMENT_PATTERN.matcher(trimmedUrl).matches()) {
            return true;
        }

        SsrfProtectionLevel level = parseProtectionLevel(config.getLevel());

        return switch (level) {
            case OFF -> true;
            case MAX -> isMaxSecurityAllowed(trimmedUrl, config);
            case MEDIUM -> isMediumSecurityAllowed(trimmedUrl, config);
            default -> false;
        };
    }

    private SsrfProtectionLevel parseProtectionLevel(SsrfProtectionLevel level) {
        try {
            return SsrfProtectionLevel.valueOf(level.name());
        } catch (IllegalArgumentException e) {
            log.warn("Invalid SSRF protection level '{}', defaulting to MEDIUM", level);
            return SsrfProtectionLevel.MEDIUM;
        }
    }

    private boolean isMaxSecurityAllowed(
            String url, ApplicationProperties.Html.UrlSecurity config) {
        // MAX security: only allow explicitly whitelisted domains
        try {
            URI uri = new URI(url);
            String host = uri.getHost();

            if (host == null) {
                return false;
            }

            return config.getAllowedDomains().contains(host.toLowerCase(Locale.ROOT));

        } catch (Exception e) {
            log.debug("Failed to parse URL for MAX security check: {}", url, e);
            return false;
        }
    }

    private boolean isMediumSecurityAllowed(
            String url, ApplicationProperties.Html.UrlSecurity config) {
        try {
            URI uri = new URI(url);
            String host = uri.getHost();

            if (host == null) {
                return false;
            }

            String hostLower = host.toLowerCase(Locale.ROOT);

            // Check explicit blocked domains
            if (config.getBlockedDomains().contains(hostLower)) {
                log.debug("URL blocked by explicit domain blocklist: {}", url);
                return false;
            }

            // Check internal TLD patterns
            for (String tld : config.getInternalTlds()) {
                if (hostLower.endsWith(tld.toLowerCase(Locale.ROOT))) {
                    log.debug("URL blocked by internal TLD pattern '{}': {}", tld, url);
                    return false;
                }
            }

            // If allowedDomains is specified, only allow those
            if (!config.getAllowedDomains().isEmpty()) {
                boolean isAllowed =
                        config.getAllowedDomains().stream()
                                .anyMatch(
                                        domain ->
                                                hostLower.equals(domain.toLowerCase(Locale.ROOT))
                                                        || hostLower.endsWith(
                                                                "."
                                                                        + domain.toLowerCase(
                                                                                Locale.ROOT)));

                if (!isAllowed) {
                    log.debug("URL not in allowed domains list: {}", url);
                    return false;
                }
            }

            // Resolve hostname to IP address for network-based checks
            try {
                InetAddress address = InetAddress.getByName(host);

                if (config.isBlockPrivateNetworks() && isPrivateAddress(address)) {
                    log.debug("URL blocked - private network address: {}", url);
                    return false;
                }

                if (config.isBlockLocalhost() && address.isLoopbackAddress()) {
                    log.debug("URL blocked - localhost address: {}", url);
                    return false;
                }

                if (config.isBlockLinkLocal() && address.isLinkLocalAddress()) {
                    log.debug("URL blocked - link-local address: {}", url);
                    return false;
                }

                if (config.isBlockCloudMetadata() && isCloudMetadataAddress(address)) {
                    log.debug("URL blocked - cloud metadata endpoint: {}", url);
                    return false;
                }

            } catch (UnknownHostException e) {
                log.debug("Failed to resolve hostname for SSRF check: {}", host, e);
                return false;
            }

            return true;

        } catch (Exception e) {
            log.debug("Failed to parse URL for MEDIUM security check: {}", url, e);
            return false;
        }
    }

    private boolean isPrivateAddress(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress()) {
            return true;
        }

        if (address instanceof Inet4Address) {
            return isPrivateIPv4Range(address.getHostAddress());
        }

        if (address instanceof Inet6Address addr6) {
            if (addr6.isLinkLocalAddress() || addr6.isSiteLocalAddress()) {
                return true;
            }

            byte[] bytes = addr6.getAddress();
            // Local-use NAT64 (64:ff9b:1::/48) is internal whatever IPv4 it embeds
            if (isNat64LocalUsePrefix(bytes)) {
                return true;
            }

            for (String ipv4 : extractEmbeddedIpv4(bytes)) {
                if (isPrivateIPv4Range(ipv4)) {
                    return true;
                }
            }

            int firstByte = bytes[0] & 0xff;
            // Check for IPv6 unique local addresses (fc00::/7)
            if ((firstByte & 0xfe) == 0xfc) {
                return true;
            }
        }

        return false;
    }

    /**
     * Extracts the IPv4 addresses wrapped by IPv6 transition formats so they can be classified by
     * the IPv4 rules. The wrapping prefixes are globally routable, so only the extracted IPv4
     * decides whether the destination is internal.
     */
    private List<String> extractEmbeddedIpv4(byte[] addr) {
        if (addr == null || addr.length != 16) {
            return List.of();
        }

        // ::ffff:w.x.y.z, ::w.x.y.z and well-known NAT64 64:ff9b::/96 all embed at bytes 12-15
        if (isIpv4MappedOrCompatibleAddress(addr) || isNat64WellKnownPrefix(addr)) {
            return List.of(toIpv4String(addr, 12, false));
        }

        // 6to4 (2002::/16) embeds the tunnel endpoint IPv4 at bytes 2-5
        if ((addr[0] & 0xff) == 0x20 && (addr[1] & 0xff) == 0x02) {
            return List.of(toIpv4String(addr, 2, false));
        }

        // Teredo (2001::/32) embeds the server IPv4 at bytes 4-7 and the client IPv4 inverted at
        // bytes 12-15
        if ((addr[0] & 0xff) == 0x20 && (addr[1] & 0xff) == 0x01 && addr[2] == 0 && addr[3] == 0) {
            return List.of(toIpv4String(addr, 4, false), toIpv4String(addr, 12, true));
        }

        return List.of();
    }

    private String toIpv4String(byte[] addr, int offset, boolean inverted) {
        int mask = inverted ? 0xff : 0x00;
        return ((addr[offset] ^ mask) & 0xff)
                + "."
                + ((addr[offset + 1] ^ mask) & 0xff)
                + "."
                + ((addr[offset + 2] ^ mask) & 0xff)
                + "."
                + ((addr[offset + 3] ^ mask) & 0xff);
    }

    private boolean isIpv4MappedOrCompatibleAddress(byte[] addr) {
        for (int i = 0; i < 10; i++) {
            if (addr[i] != 0) {
                return false;
            }
        }
        // ::ffff:w.x.y.z is IPv4-mapped, ::w.x.y.z is the deprecated IPv4-compatible form
        return (addr[10] == (byte) 0xff && addr[11] == (byte) 0xff)
                || (addr[10] == 0 && addr[11] == 0);
    }

    private boolean isNat64WellKnownPrefix(byte[] addr) {
        if (!hasNat64Prefix(addr)) {
            return false;
        }
        for (int i = 4; i < 12; i++) {
            if (addr[i] != 0) {
                return false;
            }
        }
        return true;
    }

    private boolean isNat64LocalUsePrefix(byte[] addr) {
        return hasNat64Prefix(addr) && addr[4] == 0 && addr[5] == 1;
    }

    private boolean hasNat64Prefix(byte[] addr) {
        return addr.length == 16
                && addr[0] == 0
                && (addr[1] & 0xff) == 0x64
                && (addr[2] & 0xff) == 0xff
                && (addr[3] & 0xff) == 0x9b;
    }

    private boolean isPrivateIPv4Range(String ip) {
        // Includes RFC1918, RFC6598, loopback, link-local, and unspecified addresses
        return ip.startsWith("10.")
                || ip.startsWith("192.168.")
                || (ip.startsWith("172.") && isInRange172(ip))
                || (ip.startsWith("100.") && isInRange100(ip))
                || ip.startsWith("169.254.")
                || ip.startsWith("127.")
                || "0.0.0.0".equals(ip);
    }

    private boolean isInRange172(String ip) {
        String[] parts = ip.split("\\.");
        if (parts.length >= 2) {
            try {
                int secondOctet = Integer.parseInt(parts[1]);
                return secondOctet >= 16 && secondOctet <= 31;
            } catch (NumberFormatException e) {
            }
        }
        return false;
    }

    private boolean isInRange100(String ip) {
        String[] parts = ip.split("\\.");
        if (parts.length >= 2) {
            try {
                int secondOctet = Integer.parseInt(parts[1]);
                return secondOctet >= 64 && secondOctet <= 127;
            } catch (NumberFormatException e) {
            }
        }
        return false;
    }

    private boolean isCloudMetadataAddress(InetAddress address) {
        if (address instanceof Inet6Address addr6) {
            for (String ipv4 : extractEmbeddedIpv4(addr6.getAddress())) {
                if (isCloudMetadataAddress(ipv4)) {
                    return true;
                }
            }
        }
        return isCloudMetadataAddress(address.getHostAddress());
    }

    private boolean isCloudMetadataAddress(String ip) {
        String normalizedIp = normalizeIpv4MappedAddress(ip);
        // Cloud metadata endpoints for AWS, GCP, Azure, Oracle Cloud, and IBM Cloud
        return normalizedIp.startsWith("169.254.169.254") // AWS/GCP/Azure
                || normalizedIp.startsWith("fd00:ec2::254") // AWS IPv6
                || normalizedIp.startsWith("169.254.169.253") // Oracle Cloud
                || normalizedIp.startsWith("169.254.169.250"); // IBM Cloud
    }

    private String normalizeIpv4MappedAddress(String ip) {
        if (ip == null) {
            return "";
        }
        if (ip.startsWith("::ffff:")) {
            return ip.substring(7);
        }
        int lastColon = ip.lastIndexOf(':');
        if (lastColon >= 0 && ip.indexOf('.') > lastColon) {
            return ip.substring(lastColon + 1);
        }
        return ip;
    }
}
