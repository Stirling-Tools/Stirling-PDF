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

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.notification.NotificationController;
import stirling.software.proprietary.notification.NotificationService;
import stirling.software.proprietary.notification.NotificationSource;
import stirling.software.proprietary.notification.NotificationView;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * What the bell is given to render: never a raw event id, and only the actions the client itself
 * runs, resolved for this reader by the same service that scopes the queue.
 */
@ExtendWith(MockitoExtension.class)
class NotificationProjectionTest {

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
    }

    @Nested
    @DisplayName("what the bell is given to render")
    class Projection {

        @Test
        void carriesTheKindOriginOwnershipAndTheQueuesClientActions() {
            FileRunEvent mine = given(FailureKind.INPUT_PASSWORD_PROTECTED, ACTOR, "f-1");

            NotificationView notification = controller.list(null).notifications().getFirst();

            assertThat(notification.kindId()).isEqualTo("INPUT_PASSWORD_PROTECTED");
            assertThat(notification.origin()).isEqualTo(FailureOrigin.TOOL);
            assertThat(notification.ownership()).isEqualTo(Ownership.MINE);
            assertThat(notification.severity()).isEqualTo(FailureSeverity.ERROR);
            assertThat(notification.status()).isEqualTo(FileRunEventStatus.NEW);
            assertThat(notification.fileId()).isEqualTo("f-1");
            assertThat(notification.policyId()).isNull();
            // How the client knows the fileId above is one of its own and worth looking up.
            assertThat(notification.sourceId()).isNull();
            assertThat(notification.defaultTitle()).isNotBlank();
            // The queue's own offers minus the server's: a bell offering different ones would lie.
            assertThat(notification.actions())
                    .containsExactlyElementsOf(
                            FileRunEventView.of(mine, failures.availableActions(mine))
                                    .actions()
                                    .stream()
                                    .filter(
                                            action ->
                                                    action.execution()
                                                            == FailureActionId.Execution.CLIENT)
                                    .toList());
        }

        @Test
        void offersNoActionTheServerRunsBecauseDispositionsBelongToTheQueue() {
            // Deciding a failure's fate belongs to the review surface, not the panel.
            given(FailureKind.INPUT_PASSWORD_PROTECTED, ACTOR, "f-1");

            assertThat(controller.list(null).notifications().getFirst().actions())
                    .isNotEmpty()
                    .allMatch(action -> action.execution() == FailureActionId.Execution.CLIENT);
        }

        @Test
        void namesTheSourceThatFedAnUnattendedRunSoItsFileIdIsNotMistakenForAClientsOwn() {
            // Without the source a client looks up a hash it can never resolve and calls it
            // missing.
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
            // A leader sees the team's failures, so audience filtering has to reach the bell too.
            given(FailureKind.INPUT_PASSWORD_PROTECTED, "colleague@example.com", "f-1");

            assertThat(controller.list(null).notifications().getFirst().actions())
                    .extracting(FileRunEventView.ActionView::id)
                    .containsExactly("VIEW_IN_PROCESSOR");
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
                                assertThat(action.slot()).isNotNull();
                            });
        }
    }

    @Nested
    @DisplayName("the response says whether the caller reviews the team")
    class ReviewerFlag {

        @Test
        void trueForAReviewerSoTheClientFiltersNothing() {
            when(authority.canEditPolicies()).thenReturn(true);

            assertThat(controller.list(null).viewerReviewsTeam()).isTrue();
        }

        @Test
        void falseForAMemberSoTheClientHidesRowsForFilesItDoesNotHold() {
            when(authority.canEditPolicies()).thenReturn(false);

            assertThat(controller.list(null).viewerReviewsTeam()).isFalse();
        }
    }
}
