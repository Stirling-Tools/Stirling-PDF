package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.security.autoconfigure.SecurityAutoConfiguration;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.ManagementWebSecurityAutoConfiguration;
import org.springframework.boot.security.autoconfigure.web.servlet.SecurityFilterAutoConfiguration;
import org.springframework.boot.security.autoconfigure.web.servlet.ServletWebSecurityAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * End-to-end test of the read path and action dispatch over real HTTP, against live Jetty on a
 * random port.
 *
 * <p>The other tests here call controller methods directly, which skips response serialisation,
 * body binding, query coercion and status mapping. A double-encoded request body already slipped
 * through that gap once, so these use a real {@link HttpClient} against a real socket.
 */
@SpringBootTest(
        classes = FileRunEventHttpIntegrationTest.TestApp.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FileRunEventHttpIntegrationTest {

    private static final Long TEAM = 42L;
    private static final String ACTOR = "reviewer@example.com";

    @LocalServerPort private int port;

    private final HttpClient http = HttpClient.newHttpClient();
    private final JsonMapper mapper = JsonMapper.builder().build();

    /** Shared so a test can seed a row and then read it back over the wire. */
    private static InMemoryFileRunEventRepository repository;

    @BeforeEach
    void resetRows() {
        repository.rows.clear();
    }

    private String seed(FailureKind kind, Long teamId, String fileId, String detail) {
        FileRunEventStore store = new FileRunEventStore(repository);
        return store.record(
                        new RecordFailure(
                                kind,
                                FailureOrigin.POLICY,
                                teamId,
                                "author@example.com",
                                "policy-1",
                                "run-1",
                                null,
                                fileId,
                                detail))
                .id();
    }

    private HttpResponse<String> get(String path) throws Exception {
        return http.send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> post(String path, String jsonBody) throws Exception {
        HttpRequest.Builder builder =
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                        .header("Content-Type", "application/json");
        builder =
                jsonBody == null
                        ? builder.POST(HttpRequest.BodyPublishers.noBody())
                        : builder.POST(HttpRequest.BodyPublishers.ofString(jsonBody));
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Nested
    @DisplayName("the read path")
    class ReadPath {

        @Test
        void serialisesAnEventWithItsFacetsCopyKeysAndResolvedActions() throws Exception {
            seed(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "acme-msa", "locked tight");

            HttpResponse<String> response = get("/api/v1/file-run-events");

            assertThat(response.statusCode()).isEqualTo(200);
            JsonNode row = mapper.readTree(response.body()).get("events").get(0);

            assertThat(row.get("kindId").asString()).isEqualTo("INPUT_PASSWORD_PROTECTED");
            assertThat(row.get("stage").asString()).isEqualTo("INPUT");
            assertThat(row.get("severity").asString()).isEqualTo("ERROR");
            assertThat(row.get("scope").asString()).isEqualTo("FILE");
            assertThat(row.get("origin").asString()).isEqualTo("POLICY");
            assertThat(row.get("remedy").asString()).isEqualTo("NEEDS_USER_INPUT");
            assertThat(row.get("titleKey").asString())
                    .isEqualTo("portal.failures.kind.inputPasswordProtected.title");
            assertThat(row.get("defaultTitle").asString()).isNotBlank();
            assertThat(row.get("detail").asString()).isEqualTo("locked tight");
            assertThat(row.get("status").asString()).isEqualTo("NEW");
            assertThat(row.get("occurrences").asInt()).isEqualTo(1);
            // Epoch millis, not an ISO string: the client renders relative times from a number.
            assertThat(row.get("lastSeenAt").isNumber()).isTrue();

            JsonNode actions = row.get("actions");
            assertThat(actions).hasSize(2);
            assertThat(actions.get(0).get("id").asString()).isEqualTo("ACKNOWLEDGE");
            assertThat(actions.get(0).get("labelKey").asString())
                    .isEqualTo("portal.failures.action.acknowledge");
            assertThat(actions.get(0).get("enabled").asBoolean()).isTrue();
            assertThat(actions.get(0).get("disabledReasonKey").isNull()).isTrue();
        }

        @Test
        void doesNotReturnAnotherTeamsRows() throws Exception {
            seed(FailureKind.UNKNOWN, 999L, "theirs", "not yours");

            JsonNode events = mapper.readTree(get("/api/v1/file-run-events").body()).get("events");

            assertThat(events).isEmpty();
        }

        @Test
        void ignoresAClientSuppliedTeamId() throws Exception {
            // The team comes from the principal, so a teamId query param is ignored rather than
            // honoured.
            seed(FailureKind.UNKNOWN, 999L, "theirs", "not yours");

            JsonNode events =
                    mapper.readTree(get("/api/v1/file-run-events?teamId=999").body()).get("events");

            assertThat(events).isEmpty();
        }

        @Test
        void coercesQueryParametersAndFiltersOnThem() throws Exception {
            String locked = seed(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "locked", "b");
            seed(FailureKind.UNKNOWN, TEAM, "open", "a");
            post("/api/v1/file-run-events/" + locked + "/actions/ACKNOWLEDGE", "{\"inputs\":{}}");

            JsonNode acknowledged =
                    mapper.readTree(get("/api/v1/file-run-events?status=ACKNOWLEDGED").body())
                            .get("events");
            assertThat(acknowledged).hasSize(1);

            JsonNode byKind =
                    mapper.readTree(
                                    get("/api/v1/file-run-events?kindId=INPUT_PASSWORD_PROTECTED")
                                            .body())
                            .get("events");
            assertThat(byKind).hasSize(1);
            assertThat(byKind.get(0).get("fileId").asString()).isEqualTo("locked");

            // `limit` binds as an Integer, so a non-numeric value is a bad request, not a 500.
            assertThat(get("/api/v1/file-run-events?limit=abc").statusCode()).isEqualTo(400);
        }

        @Test
        void rejectsAnUnknownStatusFilter() throws Exception {
            assertThat(get("/api/v1/file-run-events?status=BANANA").statusCode()).isEqualTo(400);
        }

        @Test
        void servesTheKindsCatalogue() throws Exception {
            HttpResponse<String> response = get("/api/v1/file-run-events/kinds");

            assertThat(response.statusCode()).isEqualTo(200);
            JsonNode kinds = mapper.readTree(response.body());
            assertThat(kinds).hasSize(FailureKind.values().length);
            assertThat(kinds.get(0).get("actions").isArray()).isTrue();
        }
    }

    @Nested
    @DisplayName("reporting from the editor")
    class Reporting {

        @Test
        void bindsAReportBodyAndAnswersNoContent() throws Exception {
            HttpResponse<String> response =
                    post(
                            "/api/v1/file-run-events/reports",
                            "{\"operation\":\"remove-password\",\"errorCode\":\"E004\","
                                    + "\"fileIds\":[\"f-1\",\"f-2\"],\"detail\":\"locked\"}");

            assertThat(response.statusCode()).isEqualTo(204);
            assertThat(response.body()).isEmpty();

            JsonNode events = mapper.readTree(get("/api/v1/file-run-events").body()).get("events");
            assertThat(events).hasSize(2);
            assertThat(events.get(0).get("origin").asString()).isEqualTo("TOOL");
            assertThat(events.get(0).get("kindId").asString())
                    .isEqualTo("INPUT_PASSWORD_PROTECTED");
        }

        @Test
        void acceptsAReportWithNoCodeOrFiles() throws Exception {
            HttpResponse<String> response =
                    post(
                            "/api/v1/file-run-events/reports",
                            "{\"operation\":\"compress\",\"detail\":\"network died\"}");

            assertThat(response.statusCode()).isEqualTo(204);
            JsonNode events = mapper.readTree(get("/api/v1/file-run-events").body()).get("events");
            assertThat(events).hasSize(1);
            assertThat(events.get(0).get("kindId").asString()).isEqualTo("UNKNOWN");
            assertThat(events.get(0).get("fileId").isNull()).isTrue();
        }

        @Test
        void rejectsAReportWithNoOperation() throws Exception {
            assertThat(
                            post(
                                            "/api/v1/file-run-events/reports",
                                            "{\"errorCode\":\"E004\",\"detail\":\"boom\"}")
                                    .statusCode())
                    .isEqualTo(400);
        }
    }

    @Nested
    @DisplayName("action dispatch")
    class Dispatch {

        @Test
        void bindsTheRequestBodyAndReturnsTheUpdatedRow() throws Exception {
            // The regression guard: an object body, sent as real JSON over the wire, binding into
            // ActionRequest. A double-encoded string would fail here.
            String id = seed(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1", "boom");

            HttpResponse<String> response =
                    post(
                            "/api/v1/file-run-events/" + id + "/actions/ACKNOWLEDGE",
                            "{\"inputs\":{}}");

            assertThat(response.statusCode()).isEqualTo(200);
            JsonNode row = mapper.readTree(response.body());
            assertThat(row.get("status").asString()).isEqualTo("ACKNOWLEDGED");
            assertThat(row.get("statusActor").asString()).isEqualTo(ACTOR);
        }

        @Test
        void acceptsAPopulatedInputsMap() throws Exception {
            // Nothing consumes inputs yet, but the shape must bind so the first action that needs
            // one (a password) does not discover a broken contract.
            String id = seed(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1", "locked");

            HttpResponse<String> response =
                    post(
                            "/api/v1/file-run-events/" + id + "/actions/ACKNOWLEDGE",
                            "{\"inputs\":{\"password\":\"hunter2\"}}");

            assertThat(response.statusCode()).isEqualTo(200);
        }

        @Test
        void acceptsAnAbsentBody() throws Exception {
            String id = seed(FailureKind.UNKNOWN, TEAM, "f1", "boom");

            assertThat(
                            post("/api/v1/file-run-events/" + id + "/actions/DISMISS", null)
                                    .statusCode())
                    .isEqualTo(200);
        }

        @Test
        void mapsAnUnknownActionToBadRequest() throws Exception {
            String id = seed(FailureKind.UNKNOWN, TEAM, "f1", "boom");

            assertThat(
                            post(
                                            "/api/v1/file-run-events/" + id + "/actions/APPROVE",
                                            "{\"inputs\":{}}")
                                    .statusCode())
                    .isEqualTo(400);
        }

        @Test
        void mapsAnotherTeamsRowToNotFound() throws Exception {
            String id = seed(FailureKind.UNKNOWN, 999L, "theirs", "boom");

            assertThat(
                            post(
                                            "/api/v1/file-run-events/"
                                                    + id
                                                    + "/actions/ACKNOWLEDGE",
                                            "{\"inputs\":{}}")
                                    .statusCode())
                    .isEqualTo(404);
        }

        @Test
        void mapsAnAlreadyClosedRowToConflict() throws Exception {
            String id = seed(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1", "boom");
            post("/api/v1/file-run-events/" + id + "/actions/DISMISS", "{\"inputs\":{}}");

            assertThat(
                            post(
                                            "/api/v1/file-run-events/"
                                                    + id
                                                    + "/actions/ACKNOWLEDGE",
                                            "{\"inputs\":{}}")
                                    .statusCode())
                    .isEqualTo(409);
        }

        @Test
        void aDismissedRowComesBackWithItsActionsDisabled() throws Exception {
            String id = seed(FailureKind.UNKNOWN, TEAM, "f1", "boom");

            JsonNode row =
                    mapper.readTree(
                            post("/api/v1/file-run-events/" + id + "/actions/DISMISS", null)
                                    .body());

            assertThat(row.get("status").asString()).isEqualTo("DISMISSED");
            for (JsonNode action : row.get("actions")) {
                assertThat(action.get("enabled").asBoolean()).isFalse();
                assertThat(action.get("disabledReasonKey").asString())
                        .isEqualTo("portal.failures.disabled.closed");
            }
        }
    }

    /**
     * Spring Security is excluded rather than configured to permit everything: the auto-configured
     * chain would answer 401 before the handler runs, and this test is about routing, body binding,
     * serialisation and status mapping. Authorisation and team scoping have their own tests.
     */
    @SpringBootConfiguration
    @EnableAutoConfiguration(
            exclude = {
                SecurityAutoConfiguration.class,
                ServletWebSecurityAutoConfiguration.class,
                ManagementWebSecurityAutoConfiguration.class,
                SecurityFilterAutoConfiguration.class,
                UserDetailsServiceAutoConfiguration.class
            })
    static class TestApp {

        /**
         * Backed by the shared in-memory repository, since this test is about the HTTP layer and
         * persistence has its own tests.
         */
        @Bean
        FileRunEventStore fileRunEventStore() {
            repository = new InMemoryFileRunEventRepository();
            return new FileRunEventStore(repository);
        }

        @Bean
        FailureActionRegistry failureActionRegistry(List<FailureAction> actions) {
            return new FailureActionRegistry(actions);
        }

        @Bean
        AcknowledgeAction acknowledgeAction(FileRunEventStore store) {
            return new AcknowledgeAction(store);
        }

        @Bean
        DismissAction dismissAction(FileRunEventStore store) {
            return new DismissAction(store);
        }

        @Bean
        ApplicationProperties applicationProperties() {
            ApplicationProperties props = new ApplicationProperties();
            props.getSecurity().setEnableLogin(true);
            props.getAutomaticallyGenerated().setAppVersion("test");
            return props;
        }

        @Bean
        PolicyManagementAuthority policyManagementAuthority() {
            PolicyManagementAuthority authority =
                    org.mockito.Mockito.mock(PolicyManagementAuthority.class);
            org.mockito.Mockito.when(authority.currentUserTeamId()).thenReturn(TEAM);
            org.mockito.Mockito.when(authority.canEditPolicies()).thenReturn(true);
            return authority;
        }

        @Bean
        UserServiceInterface userService() {
            UserServiceInterface users = org.mockito.Mockito.mock(UserServiceInterface.class);
            org.mockito.Mockito.when(users.getCurrentUsername()).thenReturn(ACTOR);
            return users;
        }

        @Bean
        FileRunEventService fileRunEventService(
                FileRunEventStore store,
                FailureActionRegistry registry,
                PolicyManagementAuthority authority,
                UserServiceInterface users,
                ApplicationProperties props) {
            return new FileRunEventService(store, registry, authority, users, props);
        }

        @Bean
        FileRunEventController fileRunEventController(
                FileRunEventService service,
                PolicyManagementAuthority authority,
                ApplicationProperties props) {
            return new FileRunEventController(service, authority, props);
        }
    }
}
