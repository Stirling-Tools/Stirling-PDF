package stirling.software.proprietary.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.MDC;
import org.springframework.boot.actuate.audit.AuditEvent;

import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

import tools.jackson.databind.json.JsonMapper;

class CustomAuditEventRepositoryTest {

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void sourceIsPopulatedFromMdcAuditSource() {
        PersistentAuditEventRepository repo = mock(PersistentAuditEventRepository.class);
        CustomAuditEventRepository writer =
                new CustomAuditEventRepository(repo, JsonMapper.builder().build());

        MDC.put("auditSource", "WEB");
        writer.add(new AuditEvent(Instant.now(), "admin", "PDF_PROCESS", Map.of("k", "v")));

        ArgumentCaptor<PersistentAuditEvent> captor =
                ArgumentCaptor.forClass(PersistentAuditEvent.class);
        verify(repo).save(captor.capture());
        assertEquals("WEB", captor.getValue().getSource());
    }

    @Test
    void sourceIsNullWhenMdcAbsent() {
        PersistentAuditEventRepository repo = mock(PersistentAuditEventRepository.class);
        CustomAuditEventRepository writer =
                new CustomAuditEventRepository(repo, JsonMapper.builder().build());

        writer.add(new AuditEvent(Instant.now(), "admin", "PDF_PROCESS", Map.of("k", "v")));

        ArgumentCaptor<PersistentAuditEvent> captor =
                ArgumentCaptor.forClass(PersistentAuditEvent.class);
        verify(repo).save(captor.capture());
        assertNull(captor.getValue().getSource());
    }

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
