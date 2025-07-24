package stirling.software.common.service;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Service
@RequiredArgsConstructor
@Slf4j
public class SsrfProtectionService {

    private final ApplicationProperties applicationProperties;

    private static final Pattern DATA_URL_PATTERN =
            Pattern.compile("^data:.*", Pattern.CASE_INSENSITIVE);
    private static final Pattern FRAGMENT_PATTERN = Pattern.compile("^#.*");

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

        switch (level) {
            case OFF:
                return true;
            case MAX:
                return isMaxSecurityAllowed(trimmedUrl, config);
            case MEDIUM:
                return isMediumSecurityAllowed(trimmedUrl, config);
            default:
                return false;
        }
    }

    private SsrfProtectionLevel parseProtectionLevel(String level) {
        try {
            return SsrfProtectionLevel.valueOf(level.toUpperCase());
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

            return config.getAllowedDomains().contains(host.toLowerCase());

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

            String hostLower = host.toLowerCase();

            // Check explicit blocked domains
            if (config.getBlockedDomains().contains(hostLower)) {
                log.debug("URL blocked by explicit domain blocklist: {}", url);
                return false;
            }

            // Check internal TLD patterns
            for (String tld : config.getInternalTlds()) {
                if (hostLower.endsWith(tld.toLowerCase())) {
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
                                                hostLower.equals(domain.toLowerCase())
                                                        || hostLower.endsWith(
                                                                "." + domain.toLowerCase()));

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
        return address.isSiteLocalAddress()
                || address.isAnyLocalAddress()
                || isPrivateIPv4Range(address.getHostAddress());
    }

    private boolean isPrivateIPv4Range(String ip) {
        return ip.startsWith("10.")
                || ip.startsWith("192.168.")
                || (ip.startsWith("172.") && isInRange172(ip))
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
                return false;
            }
        }
        return false;
    }

    private boolean isCloudMetadataAddress(String ip) {
        // Cloud metadata endpoints for AWS, GCP, Azure, Oracle Cloud, and IBM Cloud
        return ip.startsWith("169.254.169.254") // AWS/GCP/Azure
                || ip.startsWith("fd00:ec2::254") // AWS IPv6
                || ip.startsWith("169.254.169.253") // Oracle Cloud
                || ip.startsWith("169.254.169.250"); // IBM Cloud
    }
}
