package stirling.software.proprietary.workflow.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.workflow.dto.ParticipantResponse;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;

import tools.jackson.databind.ObjectMapper;

/**
 * Locks the wet-signature extraction contract across the Jackson 2 to Jackson 3 move (#7444).
 *
 * <p>Jackson 3 defaults FAIL_ON_UNKNOWN_PROPERTIES to false, where Jackson 2 defaulted it to true.
 * Under Jackson 2 an unrecognised key threw, and the catch-all in {@code extractWetSignatures}
 * discarded every signature for that participant. These tests pin the current behaviour so a future
 * mapper built with FAIL_ON_UNKNOWN_PROPERTIES re-enabled cannot silently reintroduce that loss.
 */
class WorkflowMapperWetSignatureTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private WorkflowParticipant participantWithMetadata(Map<String, Object> signature) {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("wetSignatures", List.of(signature));

        WorkflowParticipant participant = new WorkflowParticipant();
        participant.setId(7L);
        participant.setParticipantMetadata(metadata);
        return participant;
    }

    private Map<String, Object> signature() {
        Map<String, Object> signature = new HashMap<>();
        signature.put("type", "draw");
        signature.put("data", "data:image/png;base64,AAAA");
        signature.put("page", 2);
        signature.put("x", 10.5);
        signature.put("y", 20.5);
        signature.put("width", 100.0);
        signature.put("height", 40.0);
        return signature;
    }

    @Test
    void extractsAKnownSignature() {
        ParticipantResponse response =
                WorkflowMapper.toParticipantResponse(
                        participantWithMetadata(signature()), objectMapper, false);

        assertNotNull(response);
        assertEquals(1, response.getWetSignatures().size());
        assertEquals("draw", response.getWetSignatures().getFirst().getType());
        assertEquals(2, response.getWetSignatures().getFirst().getPage());
    }

    @Test
    void keepsSignaturesWhenMetadataCarriesAnUnknownKey() {
        Map<String, Object> signature = signature();
        signature.put("unknownKeyFromAnOlderClient", "ignored");

        ParticipantResponse response =
                WorkflowMapper.toParticipantResponse(
                        participantWithMetadata(signature), objectMapper, false);

        assertNotNull(response);
        assertEquals(1, response.getWetSignatures().size());
        assertEquals("draw", response.getWetSignatures().getFirst().getType());
    }
}
