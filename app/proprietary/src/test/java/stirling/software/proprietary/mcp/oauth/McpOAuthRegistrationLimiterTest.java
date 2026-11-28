package stirling.software.proprietary.mcp.oauth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

class McpOAuthRegistrationLimiterTest {

    @Test
    void addressesInOneIpv6Slash64ShareABucket() {
        assertEquals(
                McpOAuthRegistrationLimiter.sourceKey("2001:db8:1:2::1"),
                McpOAuthRegistrationLimiter.sourceKey("2001:db8:1:2:ffff:ffff:ffff:ffff"));
        assertFalse(
                McpOAuthRegistrationLimiter.sourceKey("2001:db8:1:2::1")
                        .equals(McpOAuthRegistrationLimiter.sourceKey("2001:db8:1:3::1")));
        assertEquals("203.0.113.7", McpOAuthRegistrationLimiter.sourceKey("203.0.113.7"));
        assertEquals("unknown", McpOAuthRegistrationLimiter.sourceKey(null));
    }

    @Test
    void rotatingThroughOneSlash64DoesNotEscapeThePerSourceLimit() {
        ApplicationProperties props = new ApplicationProperties();
        props.getMcp().getAuth().getBuiltin().setRegistrationsPerHourPerIp(3);
        McpOAuthRegistrationLimiter limiter = new McpOAuthRegistrationLimiter(props);

        for (int i = 1; i <= 3; i++) {
            assertTrue(limiter.tryConsume("2001:db8:1:2::" + i));
        }
        assertFalse(limiter.tryConsume("2001:db8:1:2::99"));
        assertTrue(limiter.tryConsume("2001:db8:1:3::1"));
    }
}
