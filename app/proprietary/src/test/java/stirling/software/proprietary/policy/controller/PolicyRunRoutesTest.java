package stirling.software.proprietary.policy.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.HandlerMapping;

class PolicyRunRoutesTest {

    private static boolean matchesUri(String uri) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setRequestURI(uri);
        return PolicyRunRoutes.matches(req);
    }

    private static boolean matchesPattern(String pattern) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, pattern);
        return PolicyRunRoutes.matches(req);
    }

    @Test
    void matchesTheFourExecuteRoutes() {
        assertThat(matchesUri("/api/v1/policies/run")).isTrue();
        assertThat(matchesUri("/api/v1/policies/run/stream")).isTrue();
        assertThat(matchesUri("/api/v1/policies/pol-123/run")).isTrue();
        assertThat(matchesUri("/api/v1/policies/pol-123/trigger")).isTrue();
    }

    @Test
    void excludesReadListAndCrudRoutes() {
        assertThat(matchesUri("/api/v1/policies")).isFalse(); // list + create
        assertThat(matchesUri("/api/v1/policies/runs")).isFalse();
        assertThat(matchesUri("/api/v1/policies/run/abc-run-id")).isFalse(); // GET /run/{runId}
        assertThat(matchesUri("/api/v1/policies/overview")).isFalse();
        assertThat(matchesUri("/api/v1/policies/triggers")).isFalse(); // NB: not "/trigger"
        assertThat(matchesUri("/api/v1/policies/order")).isFalse();
        assertThat(matchesUri("/api/v1/policies/pol-123")).isFalse();
        assertThat(matchesUri("/api/v1/policies/pol-123/processed-history")).isFalse();
    }

    @Test
    void isSegmentAnchoredAndContextPathTolerant() {
        assertThat(matchesUri("/stirling/api/v1/policies/pol-123/run")).isTrue();
        assertThat(matchesUri("/api/v1/policies-x/pol-123/run"))
                .isFalse(); // sibling, not the segment
        assertThat(matchesUri("/api/v1/sources/pol/run")).isFalse();
        assertThat(matchesUri("/api/v1/misc/compress-pdf")).isFalse();
    }

    /** Every request mapping on PolicyController, and whether it executes an automation. */
    private static final Map<String, Boolean> EXPECTED =
            Map.of(
                    "/api/v1/policies", false, // base: list (GET) + create (POST)
                    "/api/v1/policies/run", true,
                    "/api/v1/policies/run/stream", true,
                    "/api/v1/policies/run/{runId}", false,
                    "/api/v1/policies/runs", false,
                    "/api/v1/policies/order", false,
                    "/api/v1/policies/overview", false,
                    "/api/v1/policies/triggers", false,
                    "/api/v1/policies/{policyId}", false, // GET + DELETE
                    "/api/v1/policies/{policyId}/processed-history", false);

    // Split out because Map.of caps at 10 entries; the execute {id} routes live here.
    private static final Map<String, Boolean> EXPECTED_ID_EXECUTES =
            Map.of(
                    "/api/v1/policies/{policyId}/run", true,
                    "/api/v1/policies/{policyId}/trigger", true);

    /**
     * Fail-safe: this matcher is the sole billing gate, so an unmatched execute route would run
     * automations for free. Reconstruct every mapping on PolicyController and assert its
     * classification is declared above - a new/renamed route lands as "unclassified" and fails the
     * build until someone decides whether it executes an automation.
     */
    @Test
    void everyControllerMappingIsClassified() {
        String base = classMapping();
        Arrays.stream(PolicyController.class.getDeclaredMethods())
                .filter(m -> AnnotatedElementUtils.hasAnnotation(m, RequestMapping.class))
                .forEach(
                        m -> {
                            String pattern = base + methodMapping(m);
                            Boolean expected = expectedFor(pattern);
                            assertThat(expected)
                                    .as(
                                            "unclassified PolicyController route %s - add it to"
                                                    + " PolicyRunRoutesTest.EXPECTED",
                                            pattern)
                                    .isNotNull();
                            assertThat(matchesPattern(pattern))
                                    .as("PolicyRunRoutes classification of %s", pattern)
                                    .isEqualTo(expected);
                        });
    }

    private static Boolean expectedFor(String pattern) {
        if (EXPECTED.containsKey(pattern)) {
            return EXPECTED.get(pattern);
        }
        return EXPECTED_ID_EXECUTES.get(pattern);
    }

    private static String classMapping() {
        RequestMapping rm =
                AnnotatedElementUtils.getMergedAnnotation(
                        PolicyController.class, RequestMapping.class);
        return rm == null ? "" : firstOrEmpty(rm);
    }

    private static String methodMapping(java.lang.reflect.Method m) {
        RequestMapping rm = AnnotatedElementUtils.getMergedAnnotation(m, RequestMapping.class);
        return rm == null ? "" : firstOrEmpty(rm);
    }

    private static String firstOrEmpty(RequestMapping rm) {
        String[] paths = rm.path().length > 0 ? rm.path() : rm.value();
        return paths.length > 0 ? paths[0] : "";
    }
}
