package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
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
        // A leader unless a test says otherwise: most of these are about team scoping, which is
        // what a leader sees. The member narrowing has its own tests.
        lenient().when(authority.canEditPolicies()).thenReturn(true);
    }

    private FileRunEvent given(FailureKind kind, Long teamId, String fileId) {
        return givenHitBy("author@example.com", kind, teamId, fileId);
    }

    /** As {@link #given} but naming who the incident belongs to, which decides its ownership. */
    private FileRunEvent givenHitBy(String actor, FailureKind kind, Long teamId, String fileId) {
        return store.record(
                new RecordFailure(
                        kind,
                        FailureOrigin.POLICY,
                        teamId,
                        actor,
                        "policy-1",
                        // Distinct per file, so a RUN-scoped kind does not fold two rows into one.
                        "run-" + fileId,
                        null,
                        fileId,
                        "detail"));
    }

    @Nested
    @DisplayName("acknowledge")
    class Acknowledge {

        /**
         * No kind offers it, so it cannot be dispatched; exercised directly for rows that have it.
         */
        private FileRunEvent acknowledge(FileRunEvent event, String actor) {
            return new AcknowledgeAction(store).execute(event, Map.of(), actor);
        }

        @Test
        void isNoLongerOfferedSoItCannotBeDispatched() {
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            assertThatThrownBy(() -> service.dispatch(event.id(), "ACKNOWLEDGE", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.ACTION_NOT_DECLARED);
        }

        @Test
        void movesANewEventToAcknowledgedAndStampsTheActor() {
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            FileRunEvent updated = acknowledge(event, ACTOR);

            assertThat(updated.status()).isEqualTo(FileRunEventStatus.ACKNOWLEDGED);
            assertThat(updated.statusActor()).isEqualTo(ACTOR);
            assertThat(updated.statusAt()).isNotNull();
        }

        @Test
        void isANoOpWhenAlreadyAcknowledgedSoOwnershipIsNotStolen() {
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");
            Instant originalAt = acknowledge(event, ACTOR).statusAt();

            FileRunEvent second = acknowledge(event, "someone-else@example.com");

            assertThat(second.status()).isEqualTo(FileRunEventStatus.ACKNOWLEDGED);
            assertThat(second.statusActor()).isEqualTo(ACTOR);
            assertThat(second.statusAt()).isEqualTo(originalAt);
        }

        @Test
        void anAlreadyAcknowledgedRowStaysReadableAndClosable() {
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");
            acknowledge(event, ACTOR);

            assertThat(service.list(FileRunEventStatus.ACKNOWLEDGED, null, 10)).hasSize(1);
            assertThat(service.dispatch(event.id(), "DISMISS", Map.of()).status())
                    .isEqualTo(FileRunEventStatus.DISMISSED);
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
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");
            new AcknowledgeAction(store).execute(event, Map.of(), ACTOR);

            assertThat(service.dispatch(event.id(), "DISMISS", Map.of()).status())
                    .isEqualTo(FileRunEventStatus.DISMISSED);
        }
    }

    @Nested
    @DisplayName("resolve")
    class Resolve {

        @Test
        void marksTheRowResolvedWhenAClientReportsItsRetryWorked() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");

            FileRunEvent resolved = service.resolve(event.id());

            assertThat(resolved.status()).isEqualTo(FileRunEventStatus.RESOLVED);
            assertThat(resolved.statusActor()).isEqualTo(ACTOR);
            assertThat(service.list(null, null, 10)).as("resolved work is not open work").isEmpty();
        }

        @Test
        void isNotAnActionAnyoneCanPress() {
            // System-set on a client-side retry, so there is no id to dispatch and no button.
            assertThat(Arrays.stream(FailureActionId.values()).map(Enum::name))
                    .doesNotContain("RESOLVE", "RESOLVED");
        }

        @Test
        void reportingTheSameSuccessTwiceIsNotARefusal() {
            // A client that retries, succeeds and reports twice is telling the truth twice.
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");
            Instant first = service.resolve(event.id()).statusAt();

            assertThat(service.resolve(event.id()).statusAt()).isEqualTo(first);
        }

        @Test
        void aDismissedRowCannotBeResolvedBehindTheReviewersBack() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");
            service.dispatch(event.id(), "DISMISS", Map.of());

            assertThatThrownBy(() -> service.resolve(event.id()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.ALREADY_CLOSED);
        }

        @Test
        void anotherTeamsRowIsNotFound() {
            FileRunEvent theirs = given(FailureKind.UNKNOWN, 99L, "f1");

            assertThatThrownBy(() -> service.resolve(theirs.id()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.EVENT_NOT_FOUND);
        }

        @Test
        void aRecurrenceReopensIt() {
            // RESOLVED claims one attempt worked, not that the problem is gone for good.
            service.report(new EditorFailureReport("compress", "E004", List.of("f-1"), "boom"));
            FileRunEvent event = service.list(null, null, 10).getFirst();
            service.resolve(event.id());

            service.report(new EditorFailureReport("compress", "E004", List.of("f-1"), "boom"));

            assertThat(service.list(null, null, 10))
                    .singleElement()
                    .extracting(FileRunEvent::status)
                    .isEqualTo(FileRunEventStatus.NEW);
        }

        @Test
        void aRecurrenceReopensAnIncidentClosedBecauseTheFileWasRemoved() {
            // A library file comes back under the same id, so without this every repeat folds
            // into the closed row and the queue never shows the failure again.
            service.report(new EditorFailureReport("compress", "E001", List.of("f-1"), "boom"));
            service.forgetFiles(List.of("f-1"));
            assertThat(service.list(null, null, 10)).isEmpty();

            service.report(new EditorFailureReport("compress", "E001", List.of("f-1"), "boom"));

            assertThat(service.list(null, null, 10))
                    .singleElement()
                    .extracting(FileRunEvent::status)
                    .isEqualTo(FileRunEventStatus.NEW);
        }

        @Test
        void aRecurrenceLeavesAReviewersDismissalAlone() {
            // Dismiss is a decision about the incident, not a claim about the document, so it
            // outlasts a repeat where FILE_REMOVED and RESOLVED do not.
            service.report(new EditorFailureReport("compress", "E001", List.of("f-1"), "boom"));
            FileRunEvent event = service.list(null, null, 10).getFirst();
            service.dispatch(event.id(), "DISMISS", Map.of());

            service.report(new EditorFailureReport("compress", "E001", List.of("f-1"), "boom"));

            assertThat(service.list(null, null, 10)).isEmpty();
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

            assertThatThrownBy(() -> service.dispatch(theirs.id(), "DISMISS", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.EVENT_NOT_FOUND);
        }

        @Test
        void anUnknownEventIdIsNotFound() {
            assertThatThrownBy(() -> service.dispatch("nope", "DISMISS", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.EVENT_NOT_FOUND);
        }

        @Test
        void anActionTheClientRunsIsRefusedRatherThanPretendedTo() {
            // Answering 200 would tell the client something happened when nothing did.
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");

            assertThatThrownBy(() -> service.dispatch(event.id(), "VIEW_FILE", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.ACTION_NOT_DISPATCHABLE);

            assertThat(store.find(event.id(), TEAM).orElseThrow().status())
                    .isEqualTo(FileRunEventStatus.NEW);
        }

        @Test
        void everyClientActionIsRefusedWhicheverKindDeclaresIt() {
            // Over the whole vocabulary, so a client action added later cannot arrive dispatchable.
            for (FailureKind kind : FailureKind.values()) {
                FileRunEvent event = given(kind, TEAM, "f-" + kind.getId());
                for (FailureActionId action : kind.getActions()) {
                    if (action.runsOnServer()) {
                        continue;
                    }
                    assertThatThrownBy(() -> service.dispatch(event.id(), action.name(), Map.of()))
                            .as("%s offers %s", kind.getId(), action)
                            .isInstanceOf(FailureActionException.class)
                            .extracting(e -> ((FailureActionException) e).getReason())
                            .isEqualTo(FailureActionException.Reason.ACTION_NOT_DISPATCHABLE);
                }
            }
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
            FileRunEvent event = given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");
            service.dispatch(event.id(), "DISMISS", Map.of());

            assertThatThrownBy(() -> service.dispatch(event.id(), "DISMISS", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.ALREADY_CLOSED);
        }
    }

    @Nested
    @DisplayName("ownership is derived against whoever is reading")
    class OwnershipDerivation {

        @Test
        void theCallersOwnFailureIsMine() {
            FileRunEvent mine = givenHitBy(ACTOR, FailureKind.UNKNOWN, TEAM, "f1");

            assertThat(service.ownershipOf(mine)).isEqualTo(Ownership.MINE);
        }

        @Test
        void aColleaguesIsTheirs() {
            FileRunEvent theirs =
                    givenHitBy("colleague@example.com", FailureKind.UNKNOWN, TEAM, "f1");

            assertThat(service.ownershipOf(theirs)).isEqualTo(Ownership.THEIRS);
        }

        @Test
        void anUnattendedRunsIsNobodys() {
            // A trigger-fired run has no user to name, so there is nobody to hand the fix to.
            FileRunEvent unattended = givenHitBy(null, FailureKind.UNKNOWN, TEAM, "f1");

            assertThat(service.ownershipOf(unattended)).isEqualTo(Ownership.UNOWNED);
        }

        @Test
        void theSameRowIsMineToOnePersonAndTheirsToAnother() {
            // Why it is derived: a stored answer would be wrong for everyone but one person.
            FileRunEvent event = givenHitBy(ACTOR, FailureKind.UNKNOWN, TEAM, "f1");
            assertThat(service.ownershipOf(event)).isEqualTo(Ownership.MINE);

            when(userService.getCurrentUsername()).thenReturn("colleague@example.com");

            assertThat(service.ownershipOf(event)).isEqualTo(Ownership.THEIRS);
        }
    }

    @Nested
    @DisplayName("available actions are resolved per row and per reader")
    class Availability {

        private List<FailureActionId> offeredFor(FileRunEvent event) {
            return service.availableActions(event).stream()
                    .map(FileRunEventService.AvailableAction::id)
                    .toList();
        }

        @Test
        void theOwnerIsOfferedTheFixAndNotTheReviewersView() {
            // The unlock is the owner's to do; the processor view is for whoever reviews.
            when(authority.canEditPolicies()).thenReturn(false);
            FileRunEvent mine = givenHitBy(ACTOR, FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            assertThat(offeredFor(mine))
                    .containsExactly(
                            FailureActionId.DECRYPT,
                            FailureActionId.VIEW_FILE,
                            FailureActionId.OPEN_IN_TOOL,
                            FailureActionId.DISMISS);
            assertThat(service.availableActions(mine))
                    .allMatch(FileRunEventService.AvailableAction::enabled);
        }

        @Test
        void aReviewerReadingAColleaguesIsNotOfferedTheDocumentTheyDoNotHave() {
            // Dropped, not disabled: greyed out would read as their permission problem.
            FileRunEvent theirs =
                    givenHitBy(
                            "colleague@example.com",
                            FailureKind.INPUT_PASSWORD_PROTECTED,
                            TEAM,
                            "f1");

            assertThat(offeredFor(theirs))
                    .containsExactly(FailureActionId.VIEW_IN_PROCESSOR, FailureActionId.DISMISS);
        }

        @Test
        void aReviewerInheritsTheOwnerActionsOnAnUnattendedRow() {
            // Nobody owns it, so without the inheritance the row could only ever be dismissed.
            FileRunEvent unattended =
                    givenHitBy(null, FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            assertThat(offeredFor(unattended))
                    .containsExactly(
                            FailureActionId.DECRYPT,
                            FailureActionId.VIEW_FILE,
                            FailureActionId.VIEW_IN_PROCESSOR,
                            FailureActionId.OPEN_IN_TOOL,
                            FailureActionId.DISMISS);
        }

        @Test
        void inheritedOwnerActionsComeBackDisabledWithTheReasonWhy() {
            // No browser holds a source-fed file, so it is stated rather than offered as a dead
            // button.
            FileRunEvent unattended =
                    givenHitBy(null, FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            assertThat(service.availableActions(unattended))
                    .filteredOn(action -> action.id() != FailureActionId.DISMISS)
                    .filteredOn(action -> action.id() != FailureActionId.VIEW_IN_PROCESSOR)
                    .isNotEmpty()
                    .allSatisfy(
                            action -> {
                                assertThat(action.enabled()).isFalse();
                                assertThat(action.disabledReasonKey())
                                        .isEqualTo("processor.failures.disabled.unattended");
                            });
        }

        @Test
        void theReviewersOwnActionsStayUsableOnAnUnattendedRow() {
            FileRunEvent unattended =
                    givenHitBy(null, FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            assertThat(service.availableActions(unattended))
                    .filteredOn(
                            action ->
                                    action.id() == FailureActionId.DISMISS
                                            || action.id() == FailureActionId.VIEW_IN_PROCESSOR)
                    .hasSize(2)
                    .allMatch(FileRunEventService.AvailableAction::enabled);
        }

        @Test
        void theOwnersActionsAreDisabledWhenTheRowNamesNoDocument() {
            // Answered here, or the client calls it "not on this device" while it sits in their
            // own workbench.
            FileRunEvent documentless =
                    givenHitBy(ACTOR, FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, null);

            assertThat(service.ownershipOf(documentless)).isEqualTo(Ownership.MINE);
            assertThat(service.availableActions(documentless))
                    .filteredOn(action -> action.id() != FailureActionId.DISMISS)
                    .filteredOn(action -> action.id() != FailureActionId.VIEW_IN_PROCESSOR)
                    .isNotEmpty()
                    .allSatisfy(
                            action -> {
                                assertThat(action.enabled()).isFalse();
                                assertThat(action.disabledReasonKey())
                                        .isEqualTo("processor.failures.disabled.noDocument");
                            });
        }

        @Test
        void aRowThatNamesADocumentKeepsItsOwnerActionsUsable() {
            FileRunEvent withDocument =
                    givenHitBy(ACTOR, FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            assertThat(service.availableActions(withDocument))
                    .isNotEmpty()
                    .allMatch(FileRunEventService.AvailableAction::enabled);
        }

        @Test
        void aMemberIsNotOfferedTheOwnerActionsOnAnUnattendedRow() {
            // The inheritance is the reviewer's: a member has no claim on a run nobody attended.
            when(authority.canEditPolicies()).thenReturn(false);
            FileRunEvent unattended =
                    givenHitBy(null, FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            assertThat(offeredFor(unattended)).containsExactly(FailureActionId.DISMISS);
        }

        @Test
        void aLoginDisabledOperatorKeepsTheirOwnActions() {
            // Unowned for want of users, not because nothing attended: the one operator holds the
            // file.
            ApplicationProperties props = new ApplicationProperties();
            props.getSecurity().setEnableLogin(false);
            FileRunEventService unsecured =
                    new FileRunEventService(
                            store,
                            new FailureActionRegistry(List.of(new DismissAction(store))),
                            authority,
                            userService,
                            props);
            FileRunEvent event = givenHitBy(null, FailureKind.INPUT_PASSWORD_PROTECTED, null, "f1");

            assertThat(unsecured.availableActions(event))
                    .extracting(FileRunEventService.AvailableAction::enabled)
                    .containsOnly(true);
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
        void carriesTheKindsPlacementIntentForEachOffer() {
            FileRunEvent mine = givenHitBy(ACTOR, FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1");

            assertThat(service.availableActions(mine))
                    .filteredOn(action -> action.id() == FailureActionId.DECRYPT)
                    .singleElement()
                    .extracting(FileRunEventService.AvailableAction::slot)
                    .isEqualTo(FailureActionSlot.RESOLUTION);
        }

        @Test
        void carriesTheLabelKeyForEachOffer() {
            FileRunEvent event = given(FailureKind.UNKNOWN, TEAM, "f1");

            assertThat(service.availableActions(event))
                    .extracting(FileRunEventService.AvailableAction::labelKey)
                    .containsExactly(
                            "processor.failures.action.viewInProcessor",
                            "processor.failures.action.dismiss");
        }
    }

    @Nested
    @DisplayName("read scoping")
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
        void aMemberReadsOnlyTheFailuresTheyCaused() {
            // Reporting is open to a member, so reading their own back is what lets us tell them
            // anything at all. A colleague's must not come with it.
            store.record(RecordFailure.forEditor(FailureKind.UNKNOWN, TEAM, ACTOR, "mine", "boom"));
            store.record(
                    RecordFailure.forEditor(
                            FailureKind.UNKNOWN, TEAM, "colleague@example.com", "theirs", "boom"));
            when(authority.canEditPolicies()).thenReturn(false);

            assertThat(service.list(null, null, 50))
                    .extracting(FileRunEvent::fileId)
                    .containsExactly("mine");
        }

        @Test
        void aMemberWithNoResolvableNameReadsNothingRatherThanEverything() {
            // Narrowing to "mine" needs a name to narrow by. Dropping the filter would hand the
            // whole team to someone who may not have it.
            given(FailureKind.UNKNOWN, TEAM, "mine");
            when(authority.canEditPolicies()).thenReturn(false);
            when(userService.getCurrentUsername()).thenReturn(null);

            assertThat(service.list(null, null, 50)).isEmpty();
        }

        @Test
        void aMemberCannotActOnAColleaguesRowEvenKnowingItsId() {
            // Refusing the read is not enough on its own: an id learned any other way must not work
            // either. Reported as not-found, so trying does not confirm the row exists.
            FileRunEvent theirs =
                    store.record(
                            RecordFailure.forEditor(
                                    FailureKind.UNKNOWN,
                                    TEAM,
                                    "colleague@example.com",
                                    "theirs",
                                    "boom"));
            when(authority.canEditPolicies()).thenReturn(false);

            assertThatThrownBy(() -> service.dispatch(theirs.id(), "DISMISS", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.EVENT_NOT_FOUND);

            assertThat(store.find(theirs.id(), TEAM).orElseThrow().status())
                    .isEqualTo(FileRunEventStatus.NEW);
        }

        @Test
        void aMemberMayCloseTheirOwn() {
            // Someone who fixes their own problem should not have to ask a leader to clear the row.
            FileRunEvent mine =
                    store.record(
                            RecordFailure.forEditor(
                                    FailureKind.UNKNOWN, TEAM, ACTOR, "mine", "boom"));
            when(authority.canEditPolicies()).thenReturn(false);

            assertThat(service.dispatch(mine.id(), "DISMISS", Map.of()).status())
                    .isEqualTo(FileRunEventStatus.DISMISSED);
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
                // Only server actions need a handler, which is why the boot check ignores the rest.
                assertThat(complete.find(id).isPresent()).isEqualTo(id.runsOnServer());
            }
        }

        @Test
        void doesNotAskForAHandlerForAnActionTheClientRuns() {
            // Otherwise every client action would need an empty handler beside it.
            FailureActionRegistry serverOnly =
                    new FailureActionRegistry(
                            List.of(new AcknowledgeAction(store), new DismissAction(store)));

            assertThatCode(serverOnly::verifyEveryDeclaredActionHasAHandler)
                    .doesNotThrowAnyException();
        }

        @Test
        void refusesAHandlerForAnActionTheClientRuns() {
            // Dispatch refuses the id before resolving a handler, so the bean reads as live and is
            // not.
            assertThatThrownBy(() -> new FailureActionRegistry(List.of(new ClientSideAction())))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("VIEW_FILE");
        }

        /** A handler for a client action, which is exactly what must not be registered. */
        private static final class ClientSideAction implements FailureAction {

            @Override
            public FailureActionId id() {
                return FailureActionId.VIEW_FILE;
            }

            @Override
            public FileRunEvent execute(
                    FileRunEvent event, Map<String, String> inputs, String actor) {
                throw new UnsupportedOperationException();
            }
        }
    }

    @Nested
    @DisplayName("reporting a failure the user hit in the editor")
    class Reporting {

        @Test
        void classifiesTheReportedCodeAndStampsItAsEditorOrigin() {
            service.report(
                    new EditorFailureReport("remove-password", "E004", List.of("f-1"), "boom"));

            FileRunEvent event = store.list(TEAM, null, null, null, 10).getFirst();
            assertThat(event.kind()).isEqualTo(FailureKind.INPUT_PASSWORD_PROTECTED);
            assertThat(event.origin()).isEqualTo(FailureOrigin.TOOL);
            assertThat(event.fileId()).isEqualTo("f-1");
            assertThat(event.detail()).contains("boom");
        }

        @Test
        void takesTheTeamAndActorFromThePrincipalNotTheReport() {
            // The report carries no team or actor field at all; both come from the caller's
            // session.
            service.report(new EditorFailureReport("compress", "E004", List.of("f-1"), "boom"));

            FileRunEvent event = store.list(TEAM, null, null, null, 10).getFirst();
            assertThat(event.teamId()).isEqualTo(TEAM);
            assertThat(event.actor()).isEqualTo(ACTOR);
        }

        @Test
        void stillFilesTheRowUnderTheTeamWhenTheReporterCannotBeNamed() {
            // Recording is open to everyone and takes the caller's team, not their read scope: a
            // reporter who cannot be named reads nothing back, but the row is still the team's
            // rather than dropping into the unteamed bucket every team shares. No role stub either,
            // since recording never asks.
            when(userService.getCurrentUsername()).thenReturn(null);

            service.report(new EditorFailureReport("compress", "E004", List.of("f-1"), "boom"));

            assertThat(store.list(TEAM, null, null, null, 10))
                    .singleElement()
                    .extracting(FileRunEvent::teamId)
                    .isEqualTo(TEAM);
        }

        @Test
        void recordsAnUnrecognisedCodeAsUnknownRatherThanDroppingIt() {
            service.report(new EditorFailureReport("ocr", "E999", List.of("f-1"), "no idea"));

            assertThat(store.list(TEAM, null, null, null, 10).getFirst().kind())
                    .isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void recordsAnAbsentCodeAsUnknown() {
            service.report(new EditorFailureReport("ocr", null, List.of("f-1"), "network died"));

            assertThat(store.list(TEAM, null, null, null, 10).getFirst().kind())
                    .isEqualTo(FailureKind.UNKNOWN);
        }

        @Test
        void recordsOneIncidentPerFileSoEachDocumentStaysActionable() {
            service.report(
                    new EditorFailureReport(
                            "compress", "E004", List.of("f-1", "f-2", "f-3"), "boom"));

            assertThat(store.list(TEAM, null, null, null, 10))
                    .hasSize(3)
                    .extracting(FileRunEvent::fileId)
                    .containsExactlyInAnyOrder("f-1", "f-2", "f-3");
        }

        @Test
        void foldsARepeatOfTheSameFileIntoTheExistingIncident() {
            service.report(new EditorFailureReport("compress", "E004", List.of("f-1"), "boom"));
            service.report(
                    new EditorFailureReport("compress", "E004", List.of("f-1"), "boom again"));

            assertThat(store.list(TEAM, null, null, null, 10))
                    .singleElement()
                    .extracting(FileRunEvent::occurrences)
                    .isEqualTo(2);
        }

        @Test
        void recordsOneUnattributedIncidentWhenNoFileWasNamed() {
            service.report(new EditorFailureReport("compress", "E004", List.of(), "boom"));

            assertThat(store.list(TEAM, null, null, null, 10))
                    .singleElement()
                    .extracting(FileRunEvent::fileId)
                    .isNull();
        }

        @Test
        void recordsEveryFileInALargeBatchRatherThanTrimmingIt() {
            // A cap here used to drop the overflow silently, so a reviewer saw 25 of 60 failures
            // with nothing indicating the rest existed. The processor path has never had one.
            List<String> many =
                    java.util.stream.IntStream.range(0, 60).mapToObj(i -> "f-" + i).toList();

            service.report(new EditorFailureReport("compress", "E004", many, "boom"));

            assertThat(store.list(TEAM, null, null, null, 200)).hasSize(60);
        }

        @Test
        void keepsTheOperationNameOutOfTheStoredDocumentReferences() {
            // The operation is context for the reviewer, not a document reference: it belongs in
            // detail, never in fileId.
            service.report(
                    new EditorFailureReport("remove-password", "E004", List.of("f-1"), "boom"));

            FileRunEvent event = store.list(TEAM, null, null, null, 10).getFirst();
            assertThat(event.detail()).contains("remove-password");
            assertThat(event.fileId()).isEqualTo("f-1");
        }

        @Test
        void storesTheReportedMessageVerbatimAlongsideTheOperation() {
            // The user's own error about their own file. The operation is prefixed because an
            // editor failure has no run to give a reviewer context.
            service.report(
                    new EditorFailureReport(
                            "compress", "E004", List.of("f-1"), "Failed on Q4 report.pdf"));

            assertThat(store.list(TEAM, null, null, null, 10).getFirst().detail())
                    .isEqualTo("compress: Failed on Q4 report.pdf");
        }

        @Test
        void theServiceHoldsNothingThatCouldReachADocument() {
            // Asserted structurally rather than with verifyNoInteractions on unwired mocks, which
            // is how the version of this test on the other branch passed without proving anything.
            List<Class<?>> forbidden =
                    List.of(
                            stirling.software.proprietary.policy.ledger.ProcessedLedger.class,
                            stirling.software.common.service.FileStorage.class,
                            stirling.software.proprietary.policy.output.PolicyOutputSink.class);

            List<Class<?>> held =
                    Arrays.stream(FileRunEventService.class.getDeclaredFields())
                            .filter(field -> !field.isSynthetic())
                            .map(Field::getType)
                            .toList();

            assertThat(held).isNotEmpty().doesNotContainAnyElementsOf(forbidden);
        }
    }

    @Nested
    @DisplayName("editor incidents stay separate")
    class EditorIncidentIdentity {

        private void reportedBy(String actor, String fileId) {
            when(userService.getCurrentUsername()).thenReturn(actor);
            service.report(new EditorFailureReport("compress", null, List.of(fileId), "boom"));
        }

        @Test
        void twoPeopleHittingTheSameUnclassifiedFailureAreTwoIncidents() {
            // UNKNOWN is RUN scoped and an editor report has no run, so without the fallback every
            // unclassified editor failure in a team collapsed into one row: one actor credited for
            // everyone's, and the wrong person offered the row.
            reportedBy("alice@example.com", "a-1");
            reportedBy("bob@example.com", "b-1");

            assertThat(store.list(TEAM, null, null, null, 10))
                    .extracting(FileRunEvent::actor)
                    .containsExactlyInAnyOrder("alice@example.com", "bob@example.com");
        }

        @Test
        void onePersonsTwoBrokenFilesAreTwoIncidents() {
            reportedBy("alice@example.com", "a-1");
            reportedBy("alice@example.com", "a-2");

            assertThat(store.list(TEAM, null, null, null, 10))
                    .extracting(FileRunEvent::fileId)
                    .containsExactlyInAnyOrder("a-1", "a-2");
        }

        @Test
        void theSamePersonHittingTheSameFileTwiceIsOneIncident() {
            reportedBy("alice@example.com", "a-1");
            reportedBy("alice@example.com", "a-1");

            assertThat(store.list(TEAM, null, null, null, 10))
                    .singleElement()
                    .extracting(FileRunEvent::occurrences)
                    .isEqualTo(2);
        }
    }

    @Nested
    @DisplayName("files deleted from the editor")
    class RemovedFiles {

        private void reported(String fileId) {
            service.report(new EditorFailureReport("compress", "E004", List.of(fileId), "boom"));
        }

        @Test
        void closeTheirIncidentsSoTheQueueStopsAskingAboutThem() {
            reported("f-1");

            assertThat(service.forgetFiles(List.of("f-1"))).isEqualTo(1);
            assertThat(service.list(null, null, 10))
                    .as("the open queue is what the reviewer works from")
                    .isEmpty();
        }

        @Test
        void theRowSurvivesForAudit() {
            reported("f-1");
            service.forgetFiles(List.of("f-1"));

            assertThat(service.list(FileRunEventStatus.FILE_REMOVED, null, 10))
                    .singleElement()
                    .satisfies(
                            event -> {
                                assertThat(event.fileId()).isEqualTo("f-1");
                                assertThat(event.detail()).contains("boom");
                            });
        }

        @Test
        void aReviewersDismissKeepsItsMeaningAndItsActor() {
            reported("f-1");
            FileRunEvent event = service.list(null, null, 10).getFirst();
            service.dispatch(event.id(), "DISMISS", Map.of());

            assertThat(service.forgetFiles(List.of("f-1")))
                    .as("only open rows move; a closed one has already been decided")
                    .isZero();
            assertThat(service.list(FileRunEventStatus.DISMISSED, null, 10)).hasSize(1);
        }

        @Test
        void aColleaguesIncidentIsUntouchedEvenForALeader() {
            // File ids come from the client, so naming one must not close someone else's row. The
            // caller here is a leader, who reads the whole team: this path narrows to their own
            // rows
            // regardless, since a null actor would otherwise match every unattributed row.
            store.record(
                    RecordFailure.forEditor(
                            FailureKind.UNKNOWN, TEAM, "employee@example.com", "f-1", "theirs"));

            assertThat(service.forgetFiles(List.of("f-1"))).isZero();
        }

        @Test
        void aProcessorIncidentIsUntouchedEvenOnTheSameFileId() {
            // Nothing was deleted from an editor there, and the file may still be in the bucket.
            given(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f-1");

            assertThat(service.forgetFiles(List.of("f-1"))).isZero();
        }

        @Test
        void namingNoFilesClosesNothing() {
            reported("f-1");

            assertThat(service.forgetFiles(List.of())).isZero();
            assertThat(service.forgetFiles(java.util.Arrays.asList(null, "  "))).isZero();
            assertThat(service.list(null, null, 10)).hasSize(1);
        }
    }
}
