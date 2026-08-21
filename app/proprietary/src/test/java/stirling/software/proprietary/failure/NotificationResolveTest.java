package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
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
import stirling.software.proprietary.notification.NotificationView;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * Reporting a client-side retry that worked: the bell's one write. Lives beside the failure tests
 * because the invariants are failure invariants: the bell holds only the prefixed notification id,
 * so it cannot hand a raw event id to a failure endpoint, and the same service that scopes the
 * queue decides whose row a caller may close.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("reporting a client-side retry that worked")
class NotificationResolveTest {

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
        // This mirror exists so no client has to strip the prefix, so an unprefixed id is
        // refused rather than working by accident because there is only one source today.
        FileRunEvent event = given(FailureKind.UNKNOWN, ACTOR, "f-1");

        assertThat(statusOf(() -> controller.resolved(event.id())))
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(store.find(event.id(), TEAM).orElseThrow().status())
                .isEqualTo(FileRunEventStatus.NEW);
    }

    @Test
    void anUnknownSourcePrefixIsABadRequest() {
        // Not a 404: it was never a notification id, so there is no row to report missing.
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
        failures.dispatch(event.id(), "DISMISS", Map.of());

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
