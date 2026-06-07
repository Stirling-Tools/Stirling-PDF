package stirling.software.common.service;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
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
            String embeddedIpv4 = extractEmbeddedIpv4(bytes);
            if (embeddedIpv4 != null) {
                return isPrivateIPv4Range(embeddedIpv4);
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
     * Returns the dotted-quad IPv4 embedded in an IPv6 address that wraps an IPv4 destination, or
     * null if the address is not an embedded-IPv4 form. Covers IPv4-mapped (::ffff:0:0/96),
     * IPv4-compatible (::/96, deprecated), NAT64 well-known prefix (64:ff9b::/96, RFC 6052), and
     * 6to4 (2002::/16, RFC 3056). NAT64 and 6to4 are global-unicast prefixes that no JDK classifier
     * flags as private, so the embedded IPv4 must be re-checked against the private/reserved IPv4
     * ranges to keep the SSRF guard sound.
     */
    private String extractEmbeddedIpv4(byte[] bytes) {
        if (bytes == null || bytes.length != 16) {
            return null;
        }
        if (isIpv4MappedAddress(bytes) || isIpv4CompatibleAddress(bytes)) {
            return formatIpv4(bytes, 12);
        }
        if (isNat64Address(bytes)) {
            return formatIpv4(bytes, 12);
        }
        if (isSixToFourAddress(bytes)) {
            return formatIpv4(bytes, 2);
        }
        return null;
    }

    private boolean isIpv4MappedAddress(byte[] addr) {
        if (addr.length != 16) {
            return false;
        }
        for (int i = 0; i < 10; i++) {
            if (addr[i] != 0) {
                return false;
            }
        }
        // For IPv4-mapped IPv6 addresses, bytes 10 and 11 must be 0xff (i.e., address is
        // ::ffff:w.x.y.z)
        return addr[10] == (byte) 0xff && addr[11] == (byte) 0xff;
    }

    private boolean isIpv4CompatibleAddress(byte[] addr) {
        // ::/96 deprecated IPv4-compatible IPv6 (e.g., ::169.254.169.254). All-zero first 12 bytes
        // and a non-zero embedded IPv4 (an all-zero address would be the unspecified address, not
        // an embedded IPv4 and already caught by isAnyLocalAddress).
        if (addr.length != 16) {
            return false;
        }
        for (int i = 0; i < 12; i++) {
            if (addr[i] != 0) {
                return false;
            }
        }
        return addr[12] != 0 || addr[13] != 0 || addr[14] != 0 || addr[15] != 0;
    }

    private boolean isNat64Address(byte[] addr) {
        // NAT64 well-known prefix 64:ff9b::/96 (RFC 6052) - first 12 bytes are 00 64 ff 9b 00 00
        // ...
        if (addr.length != 16) {
            return false;
        }
        if (addr[0] != 0x00
                || addr[1] != 0x64
                || addr[2] != (byte) 0xff
                || addr[3] != (byte) 0x9b) {
            return false;
        }
        for (int i = 4; i < 12; i++) {
            if (addr[i] != 0) {
                return false;
            }
        }
        return true;
    }

    private boolean isSixToFourAddress(byte[] addr) {
        // 6to4 prefix 2002::/16 (RFC 3056) - embedded IPv4 is in bytes[2..5]
        return addr.length == 16 && addr[0] == 0x20 && addr[1] == 0x02;
    }

    private String formatIpv4(byte[] addr, int offset) {
        return (addr[offset] & 0xff)
                + "."
                + (addr[offset + 1] & 0xff)
                + "."
                + (addr[offset + 2] & 0xff)
                + "."
                + (addr[offset + 3] & 0xff);
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
        if (isCloudMetadataAddress(address.getHostAddress())) {
            return true;
        }
        // Also unwrap NAT64/6to4/IPv4-compat embedded IPv4 so cloud metadata IPs reached via an
        // IPv6 prefix are matched even when blockPrivateNetworks is disabled.
        if (address instanceof Inet6Address) {
            String embedded = extractEmbeddedIpv4(address.getAddress());
            if (embedded != null && isCloudMetadataAddress(embedded)) {
                return true;
            }
        }
        return false;
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
