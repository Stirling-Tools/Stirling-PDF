package stirling.software.saas.payg.cap;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class PolicyRunRoutesTest {

    private static boolean matchesUri(String uri) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI(uri);
        return PolicyRunRoutes.matches(req);
    }

    @Test
    void matchesExecutePaths() {
        assertThat(matchesUri("/api/v1/policies/run")).isTrue();
        assertThat(matchesUri("/api/v1/policies/run/stream")).isTrue();
        assertThat(matchesUri("/api/v1/policies/pol-123/run")).isTrue();
        assertThat(matchesUri("/api/v1/policies/pol-123/trigger")).isTrue();
    }

    @Test
    void ignoresReadAndUnrelatedPaths() {
        // status (GET /run/{runId}) and the runs list must stay ungated
        assertThat(matchesUri("/api/v1/policies/run/abc-run-id")).isFalse();
        assertThat(matchesUri("/api/v1/policies/runs")).isFalse();
        assertThat(matchesUri("/api/v1/policies")).isFalse();
        assertThat(matchesUri("/api/v1/policies/pol-123")).isFalse();
        assertThat(matchesUri("/api/v1/sources")).isFalse();
        assertThat(matchesUri("/api/v1/misc/compress-pdf")).isFalse();
    }

    @Test
    void toleratesContextPathPrefix() {
        assertThat(matchesUri("/stirling/api/v1/policies/pol-123/run")).isTrue();
    }
}
