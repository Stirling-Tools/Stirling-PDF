package stirling.software.proprietary.workflow.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.workflow.dto.ParticipantResponse;
import stirling.software.proprietary.workflow.dto.WorkflowSessionResponse;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowType;

/**
 * Regression test for GHSA-qgg6-mxw4-xg62 — verifies that the {@code includeShareToken(s)} flag
 * controls whether {@link WorkflowMapper} discloses participant bearer tokens in responses.
 * Owner-facing endpoints must still receive tokens (so they can distribute share links);
 * participant-facing endpoints must not, so a single participant token cannot be used to enumerate
 * peer bearer tokens.
 */
class WorkflowMapperShareTokenTest {

    private static final String TOKEN_A = "token-aaaa-1111";
    private static final String TOKEN_B = "token-bbbb-2222";

    private WorkflowSession buildSessionWithTwoParticipants() {
        User owner = new User();
        owner.setId(1L);
        owner.setUsername("owner@example.com");

        StoredFile original = new StoredFile();
        original.setId(42L);

        WorkflowSession session = new WorkflowSession();
        session.setSessionId("session-xyz");
        session.setOwner(owner);
        session.setOriginalFile(original);
        session.setWorkflowType(WorkflowType.SIGNING);
        session.setDocumentName("contract.pdf");

        WorkflowParticipant a = new WorkflowParticipant();
        a.setId(10L);
        a.setEmail("alice@example.com");
        a.setName("Alice");
        a.setStatus(ParticipantStatus.PENDING);
        a.setShareToken(TOKEN_A);
        a.setAccessRole(ShareAccessRole.EDITOR);
        session.addParticipant(a);

        WorkflowParticipant b = new WorkflowParticipant();
        b.setId(11L);
        b.setEmail("bob@example.com");
        b.setName("Bob");
        b.setStatus(ParticipantStatus.PENDING);
        b.setShareToken(TOKEN_B);
        b.setAccessRole(ShareAccessRole.EDITOR);
        session.addParticipant(b);

        return session;
    }

    @Test
    void toResponse_legacyOverload_includesShareTokensForOwnerCompatibility() {
        WorkflowSession session = buildSessionWithTwoParticipants();

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session);

        assertNotNull(response);
        assertEquals(2, response.getParticipants().size());
        assertEquals(TOKEN_A, response.getParticipants().get(0).getShareToken());
        assertEquals(TOKEN_B, response.getParticipants().get(1).getShareToken());
    }

    @Test
    void toResponse_withIncludeShareTokensFalse_stripsAllPeerTokens() {
        WorkflowSession session = buildSessionWithTwoParticipants();

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session, null, false);

        assertNotNull(response);
        assertEquals(2, response.getParticipants().size());
        for (ParticipantResponse p : response.getParticipants()) {
            assertNull(
                    p.getShareToken(),
                    "Participant share token must not be exposed in participant-facing responses");
        }
    }

    @Test
    void toResponse_withIncludeShareTokensFalse_preservesOtherFields() {
        WorkflowSession session = buildSessionWithTwoParticipants();

        WorkflowSessionResponse response = WorkflowMapper.toResponse(session, null, false);

        ParticipantResponse alice = response.getParticipants().get(0);
        assertEquals(10L, alice.getId());
        assertEquals("alice@example.com", alice.getEmail());
        assertEquals("Alice", alice.getName());
        assertEquals(ParticipantStatus.PENDING, alice.getStatus());
        assertEquals(ShareAccessRole.EDITOR, alice.getAccessRole());
    }

    @Test
    void toParticipantResponse_legacyOverload_includesShareToken() {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setId(1L);
        p.setEmail("a@example.com");
        p.setStatus(ParticipantStatus.PENDING);
        p.setShareToken(TOKEN_A);

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p);

        assertEquals(TOKEN_A, response.getShareToken());
    }

    @Test
    void toParticipantResponse_withIncludeShareTokenFalse_stripsToken() {
        WorkflowParticipant p = new WorkflowParticipant();
        p.setId(1L);
        p.setEmail("a@example.com");
        p.setStatus(ParticipantStatus.PENDING);
        p.setShareToken(TOKEN_A);

        ParticipantResponse response = WorkflowMapper.toParticipantResponse(p, false);

        assertNull(response.getShareToken());
        assertEquals(1L, response.getId());
        assertEquals("a@example.com", response.getEmail());
        assertEquals(ParticipantStatus.PENDING, response.getStatus());
    }
}
