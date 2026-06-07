package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.ApplicationProperties;

class SsrfProtectionServiceTest {

    private SsrfProtectionService service;

    @BeforeEach
    void setUp() {
        service = new SsrfProtectionService(new ApplicationProperties());
    }

    // Regression for GHSA-3x2q-gcww-hpj9: NAT64 (64:ff9b::/96, RFC 6052), 6to4 (2002::/16,
    // RFC 3056), and IPv4-compatible (::/96, deprecated) addresses embed an IPv4 inside a
    // global-unicast IPv6 prefix. No JDK classifier flags them, so the guard must unwrap the
    // embedded IPv4 and re-check it against the private/reserved table. The advisory verified that
    // 64:ff9b::a9fe:a9fe (= 169.254.169.254) survived the guard at v2.11.0.
    @ParameterizedTest
    @ValueSource(
            strings = {
                "http://169.254.169.254/latest/meta-data/",
                "http://127.0.0.1/internal",
                "http://[::ffff:169.254.169.254]/x",
                "http://[::ffff:127.0.0.1]/x",
                "http://[::169.254.169.254]/x",
                "http://[64:ff9b::a9fe:a9fe]/latest/meta-data/",
                "http://[64:ff9b::7f00:1]/internal",
                "http://[64:ff9b::a9fe:a9fd]/",
                "http://[64:ff9b::a9fe:a9fa]/",
                "http://[2002:a9fe:a9fe::]/latest/meta-data/",
                "http://[2002:7f00:1::]/internal",
                "http://[fd00::1]/",
                "http://[fe80::1]/",
            })
    void blocksInternalAndEmbeddedIpv4Forms(String url) {
        assertFalse(service.isUrlAllowed(url), () -> "Expected guard to block " + url);
    }

    // NAT64/6to4 wrappers around PUBLIC IPv4s must remain allowed - the fix must not over-block.
    // 64:ff9b::808:808 and 2002:808:808:: both wrap 8.8.8.8 (Google DNS, public).
    @ParameterizedTest
    @ValueSource(
            strings = {
                "http://[64:ff9b::808:808]/",
                "http://[2002:808:808::]/",
            })
    void allowsNat64AndSixToFourOfPublicIpv4(String url) {
        assertTrue(service.isUrlAllowed(url), () -> "Expected guard to allow " + url);
    }
}
