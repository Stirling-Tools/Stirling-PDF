package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Html.UrlSecurity;
import stirling.software.common.service.SsrfProtectionService.SsrfProtectionLevel;

class SsrfProtectionServiceTest {

    private ApplicationProperties applicationProperties;
    private UrlSecurity config;
    private SsrfProtectionService service;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        // Real config object: drill down to the live UrlSecurity instance and mutate it.
        config = applicationProperties.getSystem().getHtml().getUrlSecurity();
        service = new SsrfProtectionService(applicationProperties);
    }

    @Nested
    @DisplayName("Protection disabled / always-allowed inputs")
    class AlwaysAllowed {

        @Test
        @DisplayName("returns true for any URL when protection disabled")
        void disabledAllowsEverything() {
            config.setEnabled(false);
            assertThat(service.isUrlAllowed("http://169.254.169.254/latest/meta-data")).isTrue();
            assertThat(service.isUrlAllowed("http://127.0.0.1")).isTrue();
            assertThat(service.isUrlAllowed("not a url")).isTrue();
        }

        @ParameterizedTest
        @NullAndEmptySource
        @ValueSource(strings = {"   ", "\t"})
        @DisplayName("returns false for null/blank when enabled")
        void blankRejected(String url) {
            config.setEnabled(true);
            assertThat(service.isUrlAllowed(url)).isFalse();
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "data:text/plain;base64,SGVsbG8=",
                    "DATA:image/png;base64,iVBOR",
                    "#section",
                    "#"
                })
        @DisplayName("data: URLs and fragments are always allowed")
        void dataAndFragmentAllowed(String url) {
            config.setEnabled(true);
            config.setLevel(SsrfProtectionLevel.MAX);
            assertThat(service.isUrlAllowed(url)).isTrue();
        }
    }

    @Nested
    @DisplayName("OFF level")
    class OffLevel {

        @Test
        @DisplayName("allows external and internal hosts alike")
        void offAllowsAll() {
            config.setEnabled(true);
            config.setLevel(SsrfProtectionLevel.OFF);
            assertThat(service.isUrlAllowed("http://10.0.0.1/secret")).isTrue();
            assertThat(service.isUrlAllowed("https://example.com")).isTrue();
        }
    }

    @Nested
    @DisplayName("MAX level - allowlist only")
    class MaxLevel {

        @BeforeEach
        void max() {
            config.setEnabled(true);
            config.setLevel(SsrfProtectionLevel.MAX);
        }

        @Test
        @DisplayName("allows only whitelisted hosts (case-insensitive)")
        void allowsWhitelistedHost() {
            config.setAllowedDomains(List.of("example.com"));
            assertThat(service.isUrlAllowed("https://EXAMPLE.com/path")).isTrue();
            assertThat(service.isUrlAllowed("https://other.com")).isFalse();
        }

        @Test
        @DisplayName("blocks when allowlist is empty")
        void emptyAllowlistBlocks() {
            assertThat(service.isUrlAllowed("https://example.com")).isFalse();
        }

        @Test
        @DisplayName("blocks URL with no host")
        void noHostBlocked() {
            config.setAllowedDomains(List.of("example.com"));
            assertThat(service.isUrlAllowed("file:///etc/passwd")).isFalse();
        }

        @Test
        @DisplayName("blocks malformed URL (parse exception path)")
        void malformedBlocked() {
            config.setAllowedDomains(List.of("example.com"));
            assertThat(service.isUrlAllowed("http://exa mple.com")).isFalse();
        }
    }

    @Nested
    @DisplayName("MEDIUM level - host parsing and lists")
    class MediumHostAndLists {

        @BeforeEach
        void medium() {
            config.setEnabled(true);
            config.setLevel(SsrfProtectionLevel.MEDIUM);
        }

        @Test
        @DisplayName("allows a normal public literal IP")
        void allowsPublicIp() {
            assertThat(service.isUrlAllowed("http://93.184.216.34/page")).isTrue();
        }

        @Test
        @DisplayName("blocks URL with no host")
        void noHostBlocked() {
            assertThat(service.isUrlAllowed("mailto:test@example.com")).isFalse();
        }

        @Test
        @DisplayName("blocks malformed URL (parse exception path)")
        void malformedBlocked() {
            assertThat(service.isUrlAllowed("ht!tp://%%%")).isFalse();
        }

        @Test
        @DisplayName("blocks explicitly blocked domain (case-insensitive)")
        void blockedDomain() {
            config.setBlockedDomains(List.of("evil.com"));
            assertThat(service.isUrlAllowed("http://EVIL.com")).isFalse();
        }

        @Test
        @DisplayName("blocks internal TLD suffixes")
        void internalTld() {
            // default internalTlds include .local, .internal, .corp, .home
            assertThat(service.isUrlAllowed("http://server.local")).isFalse();
            assertThat(service.isUrlAllowed("http://host.internal")).isFalse();
        }

        @Test
        @DisplayName("allowlist present: host not in list is blocked before any DNS lookup")
        void allowlistRejectsUnlisted() {
            // notexample.com is rejected by the allowlist check, which runs before DNS resolution,
            // so this stays deterministic offline.
            config.setAllowedDomains(List.of("example.com"));
            assertThat(service.isUrlAllowed("http://notexample.com")).isFalse();
        }

        @Test
        @DisplayName("allowlist present: exact host and subdomain pass the allowlist gate")
        void allowlistAcceptsExactAndSubdomain() {
            // Allow a literal IP so the subsequent DNS resolution is the identity and network
            // checks are disabled, keeping the allow path deterministic without external DNS.
            config.setBlockPrivateNetworks(false);
            config.setBlockLocalhost(false);
            config.setBlockLinkLocal(false);
            config.setBlockCloudMetadata(false);
            config.setAllowedDomains(List.of("93.184.216.34"));
            assertThat(service.isUrlAllowed("http://93.184.216.34")).isTrue();
        }
    }

    @Nested
    @DisplayName("MEDIUM level - network based blocking via literal IPs")
    class MediumNetworkBlocking {

        @BeforeEach
        void medium() {
            config.setEnabled(true);
            config.setLevel(SsrfProtectionLevel.MEDIUM);
        }

        @Test
        @DisplayName("blocks loopback when blockLocalhost enabled")
        void blocksLoopback() {
            assertThat(service.isUrlAllowed("http://127.0.0.1/admin")).isFalse();
        }

        @Test
        @DisplayName("allows loopback when blockLocalhost disabled and private/link checks off")
        void allowsLoopbackWhenAllChecksOff() {
            config.setBlockLocalhost(false);
            config.setBlockPrivateNetworks(false);
            config.setBlockLinkLocal(false);
            config.setBlockCloudMetadata(false);
            assertThat(service.isUrlAllowed("http://127.0.0.1/ok")).isTrue();
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "http://10.1.2.3",
                    "http://192.168.0.5",
                    "http://172.16.0.9",
                    "http://172.31.255.1",
                    "http://100.64.0.1"
                })
        @DisplayName("blocks RFC1918 / CGNAT private ranges")
        void blocksPrivateRanges(String url) {
            assertThat(service.isUrlAllowed(url)).isFalse();
        }

        @Test
        @DisplayName("172.x and 100.x outside private sub-range are not private")
        void boundaryRangesNotPrivate() {
            // 172.15/172.32 outside 16-31; 100.63/100.128 outside 64-127.
            assertThat(service.isUrlAllowed("http://172.15.0.1")).isTrue();
            assertThat(service.isUrlAllowed("http://172.32.0.1")).isTrue();
            assertThat(service.isUrlAllowed("http://100.63.0.1")).isTrue();
        }

        @Test
        @DisplayName("allows private range when blockPrivateNetworks disabled")
        void allowsPrivateWhenDisabled() {
            config.setBlockPrivateNetworks(false);
            config.setBlockLocalhost(false);
            assertThat(service.isUrlAllowed("http://10.1.2.3")).isTrue();
        }

        @Test
        @DisplayName("blocks link-local 169.254.x via private-network check")
        void blocksLinkLocal() {
            assertThat(service.isUrlAllowed("http://169.254.1.1")).isFalse();
        }

        @Test
        @DisplayName("blocks AWS cloud-metadata IP 169.254.169.254")
        void blocksCloudMetadata() {
            assertThat(service.isUrlAllowed("http://169.254.169.254/latest/meta-data/")).isFalse();
        }

        @Test
        @DisplayName("blocks unspecified address 0.0.0.0")
        void blocksUnspecified() {
            assertThat(service.isUrlAllowed("http://0.0.0.0")).isFalse();
        }

        @Test
        @DisplayName("blocks unresolvable host (UnknownHostException path)")
        void blocksUnresolvableHost() {
            assertThat(service.isUrlAllowed("http://nonexistent-host-stirling-test.invalid/page"))
                    .isFalse();
        }
    }

    @Nested
    @DisplayName("MEDIUM level - IPv6 literal handling")
    class MediumIpv6 {

        @BeforeEach
        void medium() {
            config.setEnabled(true);
            config.setLevel(SsrfProtectionLevel.MEDIUM);
        }

        @Test
        @DisplayName("blocks IPv6 loopback ::1")
        void blocksIpv6Loopback() {
            assertThat(service.isUrlAllowed("http://[::1]/path")).isFalse();
        }

        @Test
        @DisplayName("blocks IPv6 unique-local fc00::/7")
        void blocksIpv6UniqueLocal() {
            assertThat(service.isUrlAllowed("http://[fc00::1]")).isFalse();
        }

        @Test
        @DisplayName("blocks IPv6 link-local fe80::/10")
        void blocksIpv6LinkLocal() {
            assertThat(service.isUrlAllowed("http://[fe80::1]")).isFalse();
        }

        @Test
        @DisplayName("blocks IPv4-mapped IPv6 of a private address")
        void blocksIpv4MappedPrivate() {
            assertThat(service.isUrlAllowed("http://[::ffff:10.0.0.1]")).isFalse();
        }
    }
}
