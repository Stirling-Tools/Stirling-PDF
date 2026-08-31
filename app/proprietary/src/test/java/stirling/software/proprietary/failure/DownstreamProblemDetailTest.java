package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpServerErrorException;

/**
 * Tests for {@link DownstreamProblemDetail}. Fixtures are real Problem Details bodies, since the
 * whole point is reading what {@code GlobalExceptionHandler} actually writes.
 */
@DisplayName("reading a downstream problem detail")
class DownstreamProblemDetailTest {

    private static HttpServerErrorException response(String body) {
        return HttpServerErrorException.create(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Internal Server Error",
                new HttpHeaders(),
                body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8),
                StandardCharsets.UTF_8);
    }

    @Test
    void returnsTheDetailSentence() {
        String body =
                """
                {"type":"/errors/application","title":"Application error","status":500,\
                "detail":"Document is not PDF/A compliant (PDF/A-2B): 1 rule(s) failed",\
                "errorCode":"E074"}""";

        assertThat(DownstreamProblemDetail.detailOf(response(body)))
                .isEqualTo("Document is not PDF/A compliant (PDF/A-2B): 1 rule(s) failed");
    }

    @Test
    void returnsNullWhenTheBodyCarriesNoDetail() {
        assertThat(DownstreamProblemDetail.detailOf(response("{\"status\":500}"))).isNull();
    }

    @Test
    void returnsNullWhenTheBodyIsNotJson() {
        assertThat(DownstreamProblemDetail.detailOf(response("<html>gateway timeout</html>")))
                .isNull();
    }

    @Test
    void returnsNullWhenThereIsNoBody() {
        assertThat(DownstreamProblemDetail.detailOf(response(null))).isNull();
    }
}
