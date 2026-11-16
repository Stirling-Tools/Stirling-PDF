package stirling.software.proprietary.workflow.dto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

class ParticipantRequestTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void omittedSendNotificationDefaultsToTrue() {
        ParticipantRequest request =
                mapper.readValue("{\"email\":\"p@example.com\"}", ParticipantRequest.class);

        assertThat(request.isSendNotification()).isTrue();
        assertThat(request.getEmail()).isEqualTo("p@example.com");
    }

    @Test
    void explicitFalseIsKept() {
        ParticipantRequest request =
                mapper.readValue(
                        "{\"email\":\"p@example.com\",\"sendNotification\":false}",
                        ParticipantRequest.class);

        assertThat(request.isSendNotification()).isFalse();
    }
}
