package stirling.software.proprietary.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class CustomAuditEventRepositoryTest {

    @Test
    void shortPrincipalPassesThroughUnchanged() {
        assertEquals(
                "alice@example.com", CustomAuditEventRepository.safePrincipal("alice@example.com"));
    }

    @Test
    void blankOrNullPrincipalBecomesAnonymous() {
        assertEquals("anonymous", CustomAuditEventRepository.safePrincipal(null));
        assertEquals("anonymous", CustomAuditEventRepository.safePrincipal("   "));
    }

    @Test
    void tokenShapedPrincipalIsHashedNotStoredVerbatim() {
        String jwt = "eyJhbGciOiJSUzI1NiJ9." + "x".repeat(1400);

        String safe = CustomAuditEventRepository.safePrincipal(jwt);

        assertNotEquals(jwt, safe);
        assertFalse(safe.contains(jwt), "raw token must not be stored");
        assertTrue(safe.startsWith("token:"));
        assertTrue(safe.length() <= 255, "must fit the principal column");
    }

    @Test
    void distinctTokensStayDistinguishable() {
        String a = CustomAuditEventRepository.safePrincipal("eyJ" + "a".repeat(400));
        String b = CustomAuditEventRepository.safePrincipal("eyJ" + "b".repeat(400));

        assertNotEquals(a, b, "different tokens must map to different audit principals");
    }

    @Test
    void sameTokenHashesStably() {
        String token = "eyJ" + "c".repeat(400);

        assertEquals(
                CustomAuditEventRepository.safePrincipal(token),
                CustomAuditEventRepository.safePrincipal(token));
    }
}
