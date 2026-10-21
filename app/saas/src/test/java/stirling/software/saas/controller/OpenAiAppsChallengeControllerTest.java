package stirling.software.saas.controller;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

class OpenAiAppsChallengeControllerTest {

    @Test
    void servesTrimmedTokenAsPlainText() {
        ResponseEntity<String> response =
                new OpenAiAppsChallengeController(" token-123 \n").challenge();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.TEXT_PLAIN);
        assertThat(response.getBody()).isEqualTo("token-123");
    }

    @Test
    void unsetTokenIsNotFound() {
        assertThat(new OpenAiAppsChallengeController("").challenge().getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }
}
