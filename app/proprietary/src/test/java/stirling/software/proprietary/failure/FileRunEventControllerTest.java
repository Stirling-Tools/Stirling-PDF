package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * Tests for {@link FileRunEventController}: the wire shape, the status mapping for each refusal
 * reason, and that the team is taken from the principal rather than the request.
 */
@ExtendWith(MockitoExtension.class)
class FileRunEventControllerTest {

    private static final Long TEAM = 4L;

    @Mock private PolicyManagementAuthority authority;
    @Mock private UserServiceInterface userService;

    private FileRunEventStore store;
    private FileRunEventController controller;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSecurity().setEnableLogin(true);
        store = new FileRunEventStore(new InMemoryFileRunEventRepository());
        FailureActionRegistry registry =
                new FailureActionRegistry(
                        List.of(new AcknowledgeAction(store), new DismissAction(store)));
        controller =
                new FileRunEventController(
                        new FileRunEventService(store, registry, authority, userService, props),
                        authority,
                        props);

        lenient().when(authority.canEditPolicies()).thenReturn(true);
        lenient().when(authority.currentUserTeamId()).thenReturn(TEAM);
        lenient().when(userService.getCurrentUsername()).thenReturn("reviewer@example.com");
    }

    private FileRunEvent given(FailureKind kind, Long teamId, String fileId) {
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
                        "the raw failure message"));
    }

    private static List<String> fileIds(int count) {
        return java.util.stream.IntStream.range(0, count).mapToObj(i -> "f-" + i).toList();
    }

    /** The status a refused call came back with. Fails the test if the call was allowed. */
    private HttpStatus statusOf(Runnable call) {
        try {
            call.run();
        } catch (ResponseStatusException e) {
            return HttpStatus.valueOf(e.getStatusCode().value());
        }
        throw new AssertionError("expected the call to be refused");
    }

    @Nested
    @DisplayName("listing")
    class Listing {

        @Test
        void returnsOnlyTheCallersTeamsRows() {
            given(FailureKind.UNKNOWN, TEAM, "mine");
            given(FailureKind.UNKNOWN, 99L, "theirs");

            assertThat(controller.list(null, null, null).events())
                    .extracting(FileRunEventView::fileId)
                    .containsExactly("mine");
        }

        @Test
        void carriesTheCopyKeysAndTheEnglishFallback() {
            given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            FileRunEventView view = controller.list(null, null, null).events().getFirst();

            assertThat(view.titleKey())
                    .isEqualTo("portal.failures.kind.inputPasswordProtected.title");
            assertThat(view.descriptionKey())
                    .isEqualTo("portal.failures.kind.inputPasswordProtected.description");
            assertThat(view.defaultTitle()).isNotBlank();
            assertThat(view.detail()).isEqualTo("the raw failure message");
        }

        @Test
        void carriesActionsAlreadyResolvedForTheRow() {
            given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            List<FileRunEventView.ActionView> actions =
                    controller.list(null, null, null).events().getFirst().actions();

            assertThat(actions)
                    .extracting(FileRunEventView.ActionView::id)
                    .containsExactlyInAnyOrder("ACKNOWLEDGE", "DISMISS");
            assertThat(actions).allMatch(FileRunEventView.ActionView::enabled);
        }

        @Test
        void showsAClosedRowsActionsDisabledWithAReasonRatherThanHidingThem() {
            // Only visible by asking for the closed status: the default queue drops it.
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");
            controller.act(event.id(), "DISMISS", null);

            List<FileRunEventView.ActionView> actions =
                    controller
                            .list(FileRunEventStatus.DISMISSED, null, null)
                            .events()
                            .getFirst()
                            .actions();

            assertThat(actions).noneMatch(FileRunEventView.ActionView::enabled);
            assertThat(actions)
                    .allMatch(a -> "portal.failures.disabled.closed".equals(a.disabledReasonKey()));
        }

        @Test
        void filtersByStatusAndByKind() {
            FileRunEvent locked = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "locked");
            given(FailureKind.UNKNOWN, TEAM, "open");
            controller.act(locked.id(), "ACKNOWLEDGE", null);

            assertThat(controller.list(FileRunEventStatus.ACKNOWLEDGED, null, null).events())
                    .hasSize(1);
            assertThat(controller.list(null, "INPUT_PASSWORD_PROTECTED", null).events())
                    .extracting(FileRunEventView::fileId)
                    .containsExactly("locked");
            // Acknowledged is still open work, so it stays in the default queue.
            assertThat(controller.list(null, "NO_SUCH_KIND", null).events()).isEmpty();
        }

        @Test
        void capsTheRequestedLimitSoAClientCannotAskForTheWholeTable() {
            // Distinct files, so five genuinely distinct rows exist. The earlier version of this
            // test used a RUN-scoped kind with one hardcoded run id, so all five folded into one
            // row and the assertion measured the rollup rather than the cap.
            for (int i = 0; i < 5; i++) {
                given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f" + i);
            }

            // Over-large and non-positive limits are both coerced rather than rejected.
            assertThat(controller.list(null, null, 100_000).events()).hasSize(5);
            assertThat(controller.list(null, null, 2).events()).hasSize(2);
            assertThat(controller.list(null, null, 0).events()).hasSize(1);
        }

        @Test
        void kindFilterAppliesBeforeTheLimitNotAfter() {
            // A post-limit filter would take the newest N rows and then discard non-matches,
            // returning nothing while matching rows exist. The filter lives in the query.
            given(FailureKind.UNKNOWN, TEAM, "old-unknown");
            for (int i = 0; i < 3; i++) {
                given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "newer-" + i);
            }

            assertThat(controller.list(null, "UNKNOWN", 1).events())
                    .extracting(FileRunEventView::fileId)
                    .containsExactly("old-unknown");
        }
    }

    @Nested
    @DisplayName("acting")
    class Acting {

        @Test
        void appliesADeclaredActionAndReturnsTheUpdatedRow() {
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            FileRunEventView updated = controller.act(event.id(), "ACKNOWLEDGE", null);

            assertThat(updated.status()).isEqualTo(FileRunEventStatus.ACKNOWLEDGED);
            assertThat(updated.statusActor()).isEqualTo("reviewer@example.com");
        }

        @Test
        void acceptsAnAbsentBodyBecauseTheseActionsNeedNoInput() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");

            assertThat(controller.act(event.id(), "DISMISS", null).status())
                    .isEqualTo(FileRunEventStatus.DISMISSED);
        }

        @Test
        void anUnknownActionIsABadRequest() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");

            assertThat(statusOf(() -> controller.act(event.id(), "APPROVE", null)))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void anotherTeamsRowIsNotFoundRatherThanForbidden() {
            // 404 rather than 403, so the response does not confirm the row exists.
            FileRunEvent theirs = given(FailureKind.UNKNOWN, 99L, "f1");

            assertThat(statusOf(() -> controller.act(theirs.id(), "ACKNOWLEDGE", null)))
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void anAlreadyClosedRowIsAConflict() {
            // The request was well formed and would have been valid a moment earlier.
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");
            controller.act(event.id(), "DISMISS", null);

            assertThat(statusOf(() -> controller.act(event.id(), "ACKNOWLEDGE", null)))
                    .isEqualTo(HttpStatus.CONFLICT);
        }
    }

    @Nested
    @DisplayName("the kinds catalogue")
    class Kinds {

        @Test
        void servesEveryRegisteredKindWithItsFacetsAndDeclaredActions() {
            List<FailureKindView> kinds = controller.kinds();

            assertThat(kinds).hasSameSizeAs(FailureKind.values());
            assertThat(kinds).extracting(FailureKindView::id).contains("UNKNOWN");
            assertThat(kinds).allMatch(k -> k.stage() != null && !k.actions().isEmpty());
        }

        @Test
        void carriesTheLabelKeyForEachDeclaredAction() {
            FailureKindView locked =
                    controller.kinds().stream()
                            .filter(k -> "INPUT_PASSWORD_PROTECTED".equals(k.id()))
                            .findFirst()
                            .orElseThrow();

            assertThat(locked.actions())
                    .extracting(FailureKindView.ActionDeclaration::labelKey)
                    .contains("portal.failures.action.dismissSkipFile");
        }

        @Test
        void reportsTheErrorCodesEachKindClaims() {
            FailureKindView locked =
                    controller.kinds().stream()
                            .filter(k -> "INPUT_PASSWORD_PROTECTED".equals(k.id()))
                            .findFirst()
                            .orElseThrow();

            assertThat(locked.errorCodes()).containsExactly("E004");
        }
    }

    @Nested
    @DisplayName("only a team leader may review failures")
    class Authorization {

        @Test
        void aMemberCannotListThem() {
            when(authority.canEditPolicies()).thenReturn(false);

            assertThatThrownBy(() -> controller.list(null, null, null))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.FORBIDDEN));
        }

        @Test
        void aMemberCannotDispatchAnAction() {
            // The read being refused is not enough on its own: an id learned any other way must
            // not let a member close another user's failure.
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f-1");
            when(authority.canEditPolicies()).thenReturn(false);

            assertThatThrownBy(() -> controller.act(event.id(), "DISMISS", null))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.FORBIDDEN));
        }

        @Test
        void theRegistryIsAlsoLeaderOnly() {
            when(authority.canEditPolicies()).thenReturn(false);

            assertThatThrownBy(() -> controller.kinds())
                    .isInstanceOf(ResponseStatusException.class);
        }

        @Test
        void loginDisabledTrustsTheLocalOperator() {
            // A single-user deployment has no roles to distinguish, so the role gate must not lock
            // the only user out of their own failures.
            ApplicationProperties unsecured = new ApplicationProperties();
            unsecured.getSecurity().setEnableLogin(false);
            FileRunEventController noLogin =
                    new FileRunEventController(
                            new FileRunEventService(
                                    store,
                                    new FailureActionRegistry(
                                            List.of(
                                                    new AcknowledgeAction(store),
                                                    new DismissAction(store))),
                                    authority,
                                    userService,
                                    unsecured),
                            authority,
                            unsecured);

            assertThatCode(() -> noLogin.list(null, null, null)).doesNotThrowAnyException();
            // Not merely permitted: the role is never consulted at all, which is what makes the
            // carve-out independent of however the authority answers with no users configured.
            verify(authority, never()).canEditPolicies();
        }
    }

    @Nested
    @DisplayName("team scoping cannot be influenced by the caller")
    class Scoping {

        @Test
        void thereIsNoWayToAskForAnotherTeam() {
            // Stated as a test because the absence of the parameter is the property. Adding a
            // teamId parameter to list() breaks this at compile time.
            given(FailureKind.UNKNOWN, 99L, "theirs");

            FileRunEventController.FileRunEventsResponse response =
                    controller.list(null, null, null);

            assertThat(response.events()).isEmpty();
            assertThat(
                            Arrays.stream(FileRunEventController.class.getDeclaredMethods())
                                    .filter(m -> "list".equals(m.getName()))
                                    .flatMap(m -> Arrays.stream(m.getParameterTypes()))
                                    .toList())
                    .doesNotContain(Long.class);
        }

        @Test
        void loginDisabledReadsTheUnteamedRows() {
            ApplicationProperties unsecured = new ApplicationProperties();
            unsecured.getSecurity().setEnableLogin(false);
            FileRunEventController noLogin =
                    new FileRunEventController(
                            new FileRunEventService(
                                    store,
                                    new FailureActionRegistry(
                                            List.of(
                                                    new AcknowledgeAction(store),
                                                    new DismissAction(store))),
                                    authority,
                                    userService,
                                    unsecured),
                            authority,
                            unsecured);
            given(FailureKind.UNKNOWN, null, "unteamed");
            given(FailureKind.UNKNOWN, TEAM, "teamed");

            assertThat(noLogin.list(null, null, null).events())
                    .extracting(FileRunEventView::fileId)
                    .containsExactly("unteamed");
        }
    }

    @Nested
    @DisplayName("reporting from the editor")
    class Reporting {

        @Test
        void aMemberMayReportEvenThoughTheyMayNotRead() {
            // The asymmetry is the point: anyone whose work failed can say so, but only a leader
            // reviews the queue.
            when(authority.canEditPolicies()).thenReturn(false);

            assertThatCode(
                            () ->
                                    controller.report(
                                            new EditorFailureReport(
                                                    "compress", "E004", List.of("f-1"), "boom")))
                    .doesNotThrowAnyException();
            assertThatThrownBy(() -> controller.list(null, null, null))
                    .isInstanceOf(ResponseStatusException.class);
        }

        @Test
        void answersWithNoContentSoTheEditorNeverWaitsOnABody() {
            EditorFailureReport report =
                    new EditorFailureReport("compress", "E004", List.of("f-1"), "boom");

            assertThat(controller.report(report).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        }

        @Test
        void rejectsAReportWithNoOperation() {
            assertThat(
                            statusOf(
                                    () ->
                                            controller.report(
                                                    new EditorFailureReport(
                                                            " ", "E004", List.of("f-1"), "boom"))))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void acceptsAReportAtTheFileLimitAndRecordsEveryRow() {
            List<String> atLimit = fileIds(EditorFailureReport.MAX_FILE_IDS);

            EditorFailureReport report =
                    new EditorFailureReport("compress", "E004", atLimit, "boom");

            assertThat(controller.report(report).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
            assertThat(store.list(TEAM, null, null, EditorFailureReport.MAX_FILE_IDS + 10))
                    .hasSize(EditorFailureReport.MAX_FILE_IDS);
        }

        @Test
        void refusesAReportOverTheFileLimitAndRecordsNothing() {
            // One call used to be able to mint an unbounded number of permanent incidents, since
            // each named file gets its own row and TOOL dedup keys never fold across ids. Refused
            // rather than trimmed so nothing is lost silently, and refused before the first write
            // so a rejected report cannot leave a partial set behind either.
            List<String> overLimit = fileIds(EditorFailureReport.MAX_FILE_IDS + 1);

            assertThat(
                            statusOf(
                                    () ->
                                            controller.report(
                                                    new EditorFailureReport(
                                                            "compress",
                                                            "E004",
                                                            overLimit,
                                                            "boom"))))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(store.list(TEAM, null, null, EditorFailureReport.MAX_FILE_IDS + 10))
                    .isEmpty();
        }

        @Test
        void saysWhatTheLimitIsSoAClientAuthorCanSeeWhatHappened() {
            // The editor reports in the background, so the message is the only place this surfaces.
            assertThatThrownBy(
                            () ->
                                    controller.report(
                                            new EditorFailureReport(
                                                    "compress",
                                                    "E004",
                                                    fileIds(EditorFailureReport.MAX_FILE_IDS + 1),
                                                    "boom")))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining(String.valueOf(EditorFailureReport.MAX_FILE_IDS));
        }

        @Test
        void theReportHasNoTeamOrFileNameToSupply() {
            // Stated as a test because the absence of those fields is the property. Adding either
            // to
            // EditorFailureReport breaks this at compile time.
            List<String> components =
                    java.util.Arrays.stream(EditorFailureReport.class.getRecordComponents())
                            .map(java.lang.reflect.RecordComponent::getName)
                            .toList();

            assertThat(components).containsExactly("operation", "errorCode", "fileIds", "detail");
        }
    }

    @Nested
    @DisplayName("action request body")
    class RequestBody {

        @Test
        void nullInputsAreTreatedAsEmpty() {
            assertThat(new FileRunEventController.ActionRequest(null).safeInputs()).isEmpty();
            assertThat(
                            new FileRunEventController.ActionRequest(Map.of("password", "x"))
                                    .safeInputs())
                    .containsEntry("password", "x");
        }
    }
}
