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

                if (config.isBlockCloudMetadata()
                        && isCloudMetadataAddress(address.getHostAddress())) {
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
            if (isIpv4MappedAddress(bytes)) {
                String ipv4 =
                        (bytes[12] & 0xff)
                                + "."
                                + (bytes[13] & 0xff)
                                + "."
                                + (bytes[14] & 0xff)
                                + "."
                                + (bytes[15] & 0xff);
                return isPrivateIPv4Range(ipv4);
            }

            int firstByte = bytes[0] & 0xff;
            // Check for IPv6 unique local addresses (fc00::/7)
            if ((firstByte & 0xfe) == 0xfc) {
                return true;
            }
        }

        return false;
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

    private boolean isPrivateIPv4Range(String ip) {
        // Includes RFC1918, loopback, link-local, and unspecified addresses
        return ip.startsWith("10.")
                || ip.startsWith("192.168.")
                || (ip.startsWith("172.") && isInRange172(ip))
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
