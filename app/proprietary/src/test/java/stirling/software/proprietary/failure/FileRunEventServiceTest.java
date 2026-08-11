package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.time.Instant;
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

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * Tests for {@link FileRunEventService}: team scoping, the declaration guard, transition legality,
 * and that triaging an incident leaves the document alone.
 */
@ExtendWith(MockitoExtension.class)
class FileRunEventServiceTest {

    private static final Long TEAM = 3L;
    private static final String ACTOR = "reviewer@example.com";

    @Mock private PolicyManagementAuthority authority;
    @Mock private UserServiceInterface userService;

    private FileRunEventStore store;
    private FileRunEventService service;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSecurity().setEnableLogin(true);

        store = new FileRunEventStore(new InMemoryFileRunEventRepository());
        FailureActionRegistry registry =
                new FailureActionRegistry(
                        List.of(new AcknowledgeAction(store), new DismissAction(store)));
        registry.verifyEveryDeclaredActionHasAHandler();

        service = new FileRunEventService(store, registry, authority, userService, props);

        lenient().when(authority.currentUserTeamId()).thenReturn(TEAM);
        lenient().when(userService.getCurrentUsername()).thenReturn(ACTOR);
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
                        "detail"));
    }

    @Nested
    @DisplayName("acknowledge")
    class Acknowledge {

        @Test
        void movesANewEventToAcknowledgedAndStampsTheActor() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");

            FileRunEvent updated = service.dispatch(event.id(), "ACKNOWLEDGE", Map.of());

            assertThat(updated.status()).isEqualTo(FileRunEventStatus.ACKNOWLEDGED);
            assertThat(updated.statusActor()).isEqualTo(ACTOR);
            assertThat(updated.statusAt()).isNotNull();
        }

        @Test
        void isANoOpWhenAlreadyAcknowledgedSoOwnershipIsNotStolen() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");
            FileRunEvent first = service.dispatch(event.id(), "ACKNOWLEDGE", Map.of());
            Instant originalAt = first.statusAt();

            when(userService.getCurrentUsername()).thenReturn("someone-else@example.com");
            FileRunEvent second = service.dispatch(event.id(), "ACKNOWLEDGE", Map.of());

            assertThat(second.status()).isEqualTo(FileRunEventStatus.ACKNOWLEDGED);
            assertThat(second.statusActor()).isEqualTo(ACTOR);
            assertThat(second.statusAt()).isEqualTo(originalAt);
        }
    }

    @Nested
    @DisplayName("dismiss")
    class Dismiss {

        @Test
        void closesANewEvent() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");

            assertThat(service.dispatch(event.id(), "DISMISS", Map.of()).status())
                    .isEqualTo(FileRunEventStatus.DISMISSED);
        }

        @Test
        void closesAnAcknowledgedEvent() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");
            service.dispatch(event.id(), "ACKNOWLEDGE", Map.of());

            assertThat(service.dispatch(event.id(), "DISMISS", Map.of()).status())
                    .isEqualTo(FileRunEventStatus.DISMISSED);
        }
    }

    @Nested
    @DisplayName("triage never touches the document")
    class NeverTouchesTheDocument {

        /**
         * What makes both actions valid for every kind, UNKNOWN included: they are incident
         * dispositions, not document ones. Asserted structurally — an action whose only dependency
         * is the event store <em>cannot</em> reach the ledger, file storage, or an output sink. A
         * mocked-collaborator version of this test passed vacuously, because nothing ever handed
         * the mocks to the actions.
         */
        @Test
        void actionsDependOnNothingButTheEventStore() {
            for (FailureAction action :
                    List.of(new AcknowledgeAction(store), new DismissAction(store))) {
                String name = action.getClass().getSimpleName();
                List<Class<?>> dependencies =
                        Arrays.stream(action.getClass().getDeclaredFields())
                                // Coverage instrumentation adds its own field; only ours count.
                                .filter(field -> !field.isSynthetic())
                                .map(Field::getType)
                                .toList();

                // Asserted first, so an action that lost its fields fails here rather than
                // satisfying the check below by holding nothing at all.
                assertThat(dependencies).as("%s declares no dependencies", name).isNotEmpty();
                assertThat(dependencies)
                        .as(
                                "%s: an incident disposition reaches the event store and nothing"
                                        + " else. Adding to this is how one starts touching"
                                        + " documents.",
                                name)
                        .containsOnly(FileRunEventStore.class);
            }
        }

        @Test
        void dismissLeavesTheFileReferenceIntactRatherThanClearingIt() {
            // Nothing is deleted, so the row must still say which file it was about.
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            FileRunEvent dismissed = service.dispatch(event.id(), "DISMISS", Map.of());

            assertThat(dismissed.fileId()).isEqualTo("f1");
        }
    }

    @Nested
    @DisplayName("guards")
    class Guards {

        @Test
        void anotherTeamsEventIsNotFound() {
            FileRunEvent theirs = given(FailureKind.UNKNOWN, 99L, "f1");

            assertThatThrownBy(() -> service.dispatch(theirs.id(), "ACKNOWLEDGE", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.EVENT_NOT_FOUND);
        }

        @Test
        void anUnknownEventIdIsNotFound() {
            assertThatThrownBy(() -> service.dispatch("nope", "ACKNOWLEDGE", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.EVENT_NOT_FOUND);
        }

        @Test
        void anUnknownActionIdIsRejected() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");

            assertThatThrownBy(() -> service.dispatch(event.id(), "APPROVE", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.ACTION_NOT_RECOGNISED);
        }

        @Test
        void aDeclaredActionWithNoRegisteredHandlerIsRejectedWithoutAnyStateChange() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");
            ApplicationProperties props = new ApplicationProperties();
            props.getSecurity().setEnableLogin(true);
            FileRunEventService missingHandler =
                    new FileRunEventService(
                            store,
                            new FailureActionRegistry(List.of(new AcknowledgeAction(store))),
                            authority,
                            userService,
                            props);

            assertThatThrownBy(() -> missingHandler.dispatch(event.id(), "DISMISS", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.ACTION_NOT_RECOGNISED);

            assertThat(store.find(event.id(), TEAM).orElseThrow().status())
                    .isEqualTo(FileRunEventStatus.NEW);
        }

        @Test
        void aClosedEventCannotBeActedOnAgain() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");
            service.dispatch(event.id(), "DISMISS", Map.of());

            assertThatThrownBy(() -> service.dispatch(event.id(), "ACKNOWLEDGE", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.ALREADY_CLOSED);

            assertThatThrownBy(() -> service.dispatch(event.id(), "DISMISS", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.ALREADY_CLOSED);
        }
    }

    @Nested
    @DisplayName("available actions are resolved per row")
    class Availability {

        @Test
        void openRowOffersEveryDeclaredActionEnabled() {
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            List<FileRunEventService.AvailableAction> actions = service.availableActions(event);

            assertThat(actions).hasSize(2);
            assertThat(actions).allMatch(FileRunEventService.AvailableAction::enabled);
            assertThat(actions).allMatch(action -> action.disabledReasonKey() == null);
        }

        @Test
        void closedRowOffersThemDisabledWithAReasonRatherThanHidingThem() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");
            FileRunEvent dismissed = service.dispatch(event.id(), "DISMISS", Map.of());

            List<FileRunEventService.AvailableAction> actions = service.availableActions(dismissed);

            assertThat(actions).isNotEmpty();
            assertThat(actions).noneMatch(FileRunEventService.AvailableAction::enabled);
            assertThat(actions)
                    .allMatch(
                            action ->
                                    "processor.failures.disabled.closed"
                                            .equals(action.disabledReasonKey()));
        }

        @Test
        void carriesTheKindsOverriddenLabelWhereItHasOne() {
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            assertThat(service.availableActions(event))
                    .extracting(FileRunEventService.AvailableAction::labelKey)
                    .contains("processor.failures.action.dismissSkipFile");
        }

        @Test
        void fallsBackToTheGenericLabelWhereTheKindDeclaresNoOverride() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");

            assertThat(service.availableActions(event))
                    .extracting(FileRunEventService.AvailableAction::labelKey)
                    .containsExactlyInAnyOrder(
                            "processor.failures.action.acknowledge",
                            "processor.failures.action.dismiss");
        }
    }

    @Nested
    @DisplayName("team scoping")
    class Scoping {

        @Test
        void listReturnsOnlyTheCallersTeam() {
            given(FailureKind.UNKNOWN, TEAM, "mine");
            given(FailureKind.UNKNOWN, 99L, "theirs");

            assertThat(service.list(null, null, 50))
                    .extracting(FileRunEvent::fileId)
                    .containsExactly("mine");
        }

        @Test
        void aCallerWhoseTeamCannotBeResolvedReadsNothing() {
            // A run with no stored policy is recorded unteamed, and those rows are shared by every
            // team, so a caller whose team does not resolve reads nothing instead.
            given(FailureKind.UNKNOWN, null, "someone-elses-adhoc-run");
            given(FailureKind.UNKNOWN, TEAM, "mine");
            when(authority.currentUserTeamId()).thenReturn(null);

            assertThat(service.list(null, null, 50)).isEmpty();
        }

        @Test
        void aCallerWhoseTeamCannotBeResolvedCannotActOnAnUnteamedRow() {
            FileRunEvent unteamed = given(FailureKind.UNKNOWN, null, "someone-elses-adhoc-run");
            when(authority.currentUserTeamId()).thenReturn(null);

            assertThatThrownBy(() -> service.dispatch(unteamed.id(), "ACKNOWLEDGE", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    // Not a distinct "no team" reason: that would confirm the id exists.
                    .isEqualTo(FailureActionException.Reason.EVENT_NOT_FOUND);

            assertThat(store.find(unteamed.id(), null).orElseThrow().status())
                    .isEqualTo(FileRunEventStatus.NEW);
        }

        @Test
        void loginDisabledFallsBackToTheUnteamedRowsWithoutConsultingTheAuthority() {
            ApplicationProperties props = new ApplicationProperties();
            props.getSecurity().setEnableLogin(false);
            FailureActionRegistry registry =
                    new FailureActionRegistry(
                            List.of(new AcknowledgeAction(store), new DismissAction(store)));
            FileRunEventService unsecured =
                    new FileRunEventService(store, registry, authority, userService, props);

            given(FailureKind.UNKNOWN, null, "unteamed");
            given(FailureKind.UNKNOWN, TEAM, "teamed");

            assertThat(unsecured.list(null, null, 50))
                    .extracting(FileRunEvent::fileId)
                    .containsExactly("unteamed");
        }
    }

    @Nested
    @DisplayName("the action registry")
    class Registry {

        @Test
        void refusesToStartWhenAKindDeclaresAnActionWithNoHandler() {
            // A missing handler would otherwise surface as a button that 400s in production.
            FailureActionRegistry incomplete =
                    new FailureActionRegistry(List.of(new AcknowledgeAction(store)));

            assertThatThrownBy(incomplete::verifyEveryDeclaredActionHasAHandler)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("DISMISS");
        }

        @Test
        void refusesTwoHandlersForTheSameAction() {
            assertThatThrownBy(
                            () ->
                                    new FailureActionRegistry(
                                            List.of(
                                                    new AcknowledgeAction(store),
                                                    new AcknowledgeAction(store))))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("ACKNOWLEDGE");
        }

        @Test
        void acceptsACompleteSetOfHandlers() {
            FailureActionRegistry complete =
                    new FailureActionRegistry(
                            List.of(new AcknowledgeAction(store), new DismissAction(store)));

            complete.verifyEveryDeclaredActionHasAHandler();

            for (FailureActionId id : FailureActionId.values()) {
                assertThat(complete.find(id)).isPresent();
            }
        }
    }
}
