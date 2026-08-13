package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.List;

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
import stirling.software.proprietary.notification.NotificationController;
import stirling.software.proprietary.notification.NotificationService;
import stirling.software.proprietary.notification.NotificationSource;
import stirling.software.proprietary.notification.NotificationView;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * How the bell reaches a failure: by the prefixed notification id and nothing else. Lives beside
 * the failure tests because that is a failure invariant. The bell is never handed a raw event id,
 * so it cannot call a failure endpoint, and the same service decides what it may do.
 */
@ExtendWith(MockitoExtension.class)
class NotificationActionDispatchTest {

    private static final Long TEAM = 7L;
    private static final String ACTOR = "reviewer@example.com";

    @Mock private PolicyManagementAuthority authority;
    @Mock private UserServiceInterface userService;

    private FileRunEventStore store;
    private FileRunEventService failures;
    private NotificationController controller;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSecurity().setEnableLogin(true);
        store = new FileRunEventStore(new InMemoryFileRunEventRepository());
        failures =
                new FileRunEventService(
                        store,
                        new FailureActionRegistry(
                                List.of(new AcknowledgeAction(store), new DismissAction(store))),
                        authority,
                        userService,
                        props);
        controller = new NotificationController(new NotificationService(failures));

        lenient().when(authority.currentUserTeamId()).thenReturn(TEAM);
        lenient().when(authority.canEditPolicies()).thenReturn(true);
        lenient().when(userService.getCurrentUsername()).thenReturn(ACTOR);
    }

    private FileRunEvent given(FailureKind kind, String actor, String fileId) {
        return store.record(RecordFailure.forEditor(kind, TEAM, actor, fileId, "boom"));
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
    @DisplayName("the bell holds a prefixed id and nothing else")
    class Ids {

        @Test
        void everyNotificationIsKeyedByItsSourceAndRowId() {
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");

            NotificationView notification = controller.list(null).notifications().getFirst();

            assertThat(notification.id()).isEqualTo("failure:" + event.id());
            assertThat(notification.source()).isEqualTo(NotificationSource.FAILURE);
        }

        @Test
        void dismissingTakesThePrefixedIdRatherThanTheRowsOwn() {
            // The point of the prefix: the bell closes an incident without ever holding an id a
            // failure endpoint would accept.
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");

            NotificationView updated = controller.act("failure:" + event.id(), "DISMISS", null);

            assertThat(updated.status()).isEqualTo(FileRunEventStatus.DISMISSED);
            assertThat(store.find(event.id(), TEAM).orElseThrow().status())
                    .isEqualTo(FileRunEventStatus.DISMISSED);
        }

        @Test
        void theRowsOwnIdIsNotANotificationId() {
            // An unprefixed id names no source, so it is refused rather than working by accident
            // because there is only one source today.
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");

            assertThat(statusOf(() -> controller.act(event.id(), "DISMISS", null)))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(store.find(event.id(), TEAM).orElseThrow().status())
                    .isEqualTo(FileRunEventStatus.NEW);
        }

        @Test
        void anUnknownSourcePrefixIsABadRequest() {
            // Not a 404: it was never a notification id, so there is no row to report missing.
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");

            assertThat(statusOf(() -> controller.act("quota:" + event.id(), "DISMISS", null)))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(statusOf(() -> controller.act("failure:", "DISMISS", null)))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(statusOf(() -> controller.act(":" + event.id(), "DISMISS", null)))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void aPrefixWithNoSuchRowIsNotFound() {
            // The prefix parsed, so this is the source's answer about its own row, unchanged.
            assertThat(statusOf(() -> controller.act("failure:nope", "DISMISS", null)))
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("reporting a client-side retry that worked")
    class Resolving {

        @Test
        void closesTheRowBehindThePrefixedId() {
            // Why the route exists: a successful retry has to close its row, and the bell
            // has no raw id to close it with.
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");

            NotificationView resolved = controller.resolved("failure:" + event.id());

            assertThat(resolved.status()).isEqualTo(FileRunEventStatus.RESOLVED);
            assertThat(store.find(event.id(), TEAM).orElseThrow().status())
                    .isEqualTo(FileRunEventStatus.RESOLVED);
        }

        @Test
        void theRowsOwnIdIsNotANotificationId() {
            // Same invariant as the action route: this mirror exists so no client has to strip the
            // prefix, so an unprefixed id is refused here too.
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");

            assertThat(statusOf(() -> controller.resolved(event.id())))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(store.find(event.id(), TEAM).orElseThrow().status())
                    .isEqualTo(FileRunEventStatus.NEW);
        }

        @Test
        void anUnknownSourcePrefixIsABadRequest() {
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");

            assertThat(statusOf(() -> controller.resolved("quota:" + event.id())))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(statusOf(() -> controller.resolved("failure:")))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void reportingTheSameSuccessTwiceIsNotARefusal() {
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");
            NotificationView first = controller.resolved("failure:" + event.id());

            assertThat(controller.resolved("failure:" + event.id()))
                    .isEqualTo(first)
                    .extracting(NotificationView::status)
                    .isEqualTo(FileRunEventStatus.RESOLVED);
        }

        @Test
        void aRowAReviewerHasDismissedIsAConflict() {
            // Their decision stands: a retry reporting in afterwards does not overwrite it.
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");
            controller.act("failure:" + event.id(), "DISMISS", null);

            assertThat(statusOf(() -> controller.resolved("failure:" + event.id())))
                    .isEqualTo(HttpStatus.CONFLICT);
            assertThat(store.find(event.id(), TEAM).orElseThrow().status())
                    .isEqualTo(FileRunEventStatus.DISMISSED);
        }

        @Test
        void aColleaguesNotificationIsNotFoundForAMember() {
            FileRunEvent theirs = given(FailureKind.UNKNOWN, "colleague@example.com", "f-1");
            when(authority.canEditPolicies()).thenReturn(false);

            assertThat(statusOf(() -> controller.resolved("failure:" + theirs.id())))
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("refusals answer as the failure surface would")
    class Refusals {

        @Test
        void anActionTheClientRunsIsABadRequest() {
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");

            assertThat(statusOf(() -> controller.act("failure:" + event.id(), "RETRY", null)))
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        void anAlreadyDismissedNotificationIsAConflict() {
            FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");
            controller.act("failure:" + event.id(), "DISMISS", null);

            assertThat(statusOf(() -> controller.act("failure:" + event.id(), "DISMISS", null)))
                    .isEqualTo(HttpStatus.CONFLICT);
        }

        @Test
        void aColleaguesNotificationIsNotFoundForAMember() {
            // The bell cannot widen what the source scopes: a member never had this row.
            FileRunEvent theirs = given(FailureKind.UNKNOWN, "colleague@example.com", "f-1");
            when(authority.canEditPolicies()).thenReturn(false);

            assertThat(statusOf(() -> controller.act("failure:" + theirs.id(), "DISMISS", null)))
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("what the bell is given to render")
    class Projection {

        @Test
        void carriesTheKindOriginOwnershipAndTheSameActionsAsTheQueue() {
            FileRunEvent mine = given(FailureKind.INPUT_PASSWORD_PROTECTED, ACTOR, "f-1");

            NotificationView notification = controller.list(null).notifications().getFirst();

            assertThat(notification.kindId()).isEqualTo("INPUT_PASSWORD_PROTECTED");
            assertThat(notification.origin()).isEqualTo(FailureOrigin.TOOL);
            assertThat(notification.ownership()).isEqualTo(Ownership.MINE);
            assertThat(notification.severity()).isEqualTo(FailureSeverity.ERROR);
            assertThat(notification.status()).isEqualTo(FileRunEventStatus.NEW);
            assertThat(notification.fileId()).isEqualTo("f-1");
            assertThat(notification.policyId()).isNull();
            // No source fed it, which is how the client knows the fileId above is one of its own
            // references and worth looking up locally.
            assertThat(notification.sourceId()).isNull();
            assertThat(notification.defaultTitle()).isNotBlank();
            // The failure queue's own resolved list, element for element: a bell offering
            // different buttons from the queue would be a bell that lies.
            assertThat(notification.actions())
                    .containsExactlyElementsOf(
                            FileRunEventView.of(mine, failures.availableActions(mine)).actions());
        }

        @Test
        void namesTheSourceThatFedAnUnattendedRunSoItsFileIdIsNotMistakenForAClientsOwn() {
            // Only a source-fed run's fileId is a hash, so the source is the discriminator: without
            // it a client would look up a hash it can never resolve and call the document missing.
            store.record(
                    RecordFailure.forRun(
                            FailureKind.INPUT_PASSWORD_PROTECTED,
                            TEAM,
                            null,
                            "policy-1",
                            "run-1",
                            "source-7",
                            "hashed-identity",
                            "boom"));

            NotificationView notification = controller.list(null).notifications().getFirst();

            assertThat(notification.sourceId()).isEqualTo("source-7");
            assertThat(notification.fileId()).isEqualTo("hashed-identity");
        }

        @Test
        void aColleaguesNotificationOffersTheReviewersActionsOnly() {
            // The bell shows a leader their team's failures, so the audience filtering has to reach
            // it: no offering someone a password they do not have.
            given(FailureKind.INPUT_PASSWORD_PROTECTED, "colleague@example.com", "f-1");

            assertThat(controller.list(null).notifications().getFirst().actions())
                    .extracting(FileRunEventView.ActionView::id)
                    .containsExactly("VIEW_IN_PROCESSOR", "DISMISS");
        }

        @Test
        void carriesWhatAClientNeedsToRenderAnActionItDoesNotKnow() {
            given(FailureKind.INPUT_PASSWORD_PROTECTED, ACTOR, "f-1");

            assertThat(controller.list(null).notifications().getFirst().actions())
                    .isNotEmpty()
                    .allSatisfy(
                            action -> {
                                assertThat(action.labelKey()).startsWith("portal.failures.action.");
                                assertThat(action.defaultLabel()).isNotBlank();
                                assertThat(action.execution()).isNotNull();
                            });
        }
    }
}
