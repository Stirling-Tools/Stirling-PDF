package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

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
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

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
    @Mock private PolicyStore policyStore;
    @Mock private StoredFileRepository storedFiles;

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
                        props,
                        policyStore);
        controller = new NotificationController(new NotificationService(failures, storedFiles));

        lenient().when(authority.currentUserTeamId()).thenReturn(TEAM);
        lenient().when(authority.canEditPolicies()).thenReturn(true);
        lenient().when(userService.getCurrentUsername()).thenReturn(ACTOR);
        // Every source-fed row here came from a smart folder unless a test says otherwise.
        lenient().when(policyStore.get(anyString())).thenReturn(Optional.of(smartFolder()));
    }

    private static Policy smartFolder() {
        return new Policy(
                        "policy-1",
                        "Payroll",
                        ACTOR,
                        true,
                        List.of(),
                        List.of(),
                        OutputSpec.inline())
                .withSurface(Policy.SURFACE_PROCESSING_FOLDER);
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
                            FileRunEventView.of(
                                            mine,
                                            ProducingSurface.EDITOR,
                                            failures.availableActions(mine))
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
        void holdsBackAFailureNamingNoDocumentBecauseTheBellCouldOnlySaySo() {
            // The only row the bell can offer nothing for. The review surface still lists it.
            given(FailureKind.UNKNOWN, ACTOR, null);
            given(FailureKind.INPUT_PASSWORD_PROTECTED, ACTOR, "f-1");

            assertThat(controller.list(null).notifications())
                    .singleElement()
                    .satisfies(row -> assertThat(row.fileId()).isEqualTo("f-1"));
        }

        @Test
        void keepsARunScopedFailureThatStillNamesADocument() {
            // An editor-reported tool failure is RUN-scoped but names the file it ran on, so
            // filtering on the kind's scope rather than the row would have dropped it.
            given(FailureKind.UNKNOWN, ACTOR, "f-2");

            assertThat(controller.list(null).notifications())
                    .singleElement()
                    .satisfies(
                            row -> {
                                assertThat(row.kindId()).isEqualTo("UNKNOWN");
                                assertThat(row.fileId()).isEqualTo("f-2");
                            });
        }

        @Test
        void withholdsTheReferenceBehindASourceFedRow() {
            // A folder source builds its identity from the file's canonical path, so sending the
            // reference would hand every reader a location on the operator's disk.
            store.record(
                    RecordFailure.forRun(
                            FailureKind.INPUT_PASSWORD_PROTECTED,
                            TEAM,
                            null,
                            "policy-1",
                            "run-1",
                            "source-7",
                            "/Users/someone/Documents/Payroll/march.pdf",
                            "boom"));

            NotificationView notification = controller.list(null).notifications().getFirst();

            assertThat(notification.sourceId()).isEqualTo("source-7");
            assertThat(notification.documentLocation())
                    .isEqualTo(FileRunEventView.DocumentLocation.SMART_FOLDER);
            assertThat(notification.fileId()).isNull();
        }

        @Test
        void aBucketFedPolicyRowIsNotCalledASmartFoldersAndOffersNoFolderRetry() {
            // The same source-fed shape from an S3 or webhook policy. Calling it a smart folder's
            // told the owner so, and offered a retry the folder handler could only refuse.
            lenient()
                    .when(policyStore.get(anyString()))
                    .thenReturn(Optional.of(smartFolder().withSurface(Policy.SURFACE_POLICY)));
            FileRunEvent row =
                    store.record(
                            RecordFailure.forRun(
                                    FailureKind.UNKNOWN,
                                    TEAM,
                                    ACTOR,
                                    "policy-1",
                                    "run-1",
                                    "source-s3",
                                    "s3://bucket/march.pdf",
                                    "boom"));

            NotificationView notification = controller.list(null).notifications().getFirst();

            assertThat(notification.documentLocation())
                    .isEqualTo(FileRunEventView.DocumentLocation.UNREACHABLE);
            // The retry is the browser's here, which holds nothing to run it on, so the bell hides
            // it; and the server will not run it either.
            assertThat(notification.actions())
                    .filteredOn(action -> action.id().equals("OPEN_IN_TOOL"))
                    .extracting(FileRunEventView.ActionView::execution)
                    .containsExactly(FailureActionId.Execution.CLIENT);
            // The reason, not just the type: with no OPEN_IN_TOOL handler registered here, a broken
            // location guard would still throw, as ACTION_NOT_RECOGNISED, and pass a looser check.
            assertThatThrownBy(() -> failures.dispatch(row.id(), "OPEN_IN_TOOL", Map.of()))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.ACTION_NOT_DISPATCHABLE);
        }

        @Test
        void aSourceFedRowWhosePolicyIsGoneStaysWithheldRatherThanReadingAsTheBrowsers() {
            // The lookup that tells a folder from a bucket can come back empty once the policy is
            // deleted. That must not turn the row into a browser's, or the path behind it leaks.
            lenient().when(policyStore.get(anyString())).thenReturn(Optional.empty());
            FileRunEvent row =
                    store.record(
                            RecordFailure.forRun(
                                    FailureKind.INPUT_PASSWORD_PROTECTED,
                                    TEAM,
                                    null,
                                    "policy-gone",
                                    "run-1",
                                    "source-7",
                                    "/Users/someone/Documents/Payroll/march.pdf",
                                    "boom"));

            NotificationView notification = controller.list(null).notifications().getFirst();

            assertThat(notification.documentLocation())
                    .isEqualTo(FileRunEventView.DocumentLocation.UNREACHABLE);
            assertThat(notification.fileId()).isNull();
            // Still a policy's row, never the editor's, so nothing downstream reads it as the
            // browser's own.
            assertThat(failures.producingSurfaceOf(row)).isEqualTo(ProducingSurface.POLICY);
            assertThat(notification.toString()).doesNotContain("Payroll", "march.pdf");
        }

        @Test
        void namesAStoredDocumentForItsOwnerAndNobodyElse() {
            // The one reader entitled to the name already has the file. A storage-backed folder can
            // answer because its identity is the stored row's id.
            User owner = new User();
            owner.setUsername(ACTOR);
            StoredFile file = new StoredFile();
            file.setOwner(owner);
            file.setId(42L);
            file.setOriginalFilename("march.pdf");
            when(storedFiles.findAllById(Set.of(42L))).thenReturn(List.of(file));
            store.record(
                    RecordFailure.forRun(
                            FailureKind.UNKNOWN,
                            TEAM,
                            ACTOR,
                            "policy-1",
                            "run-1",
                            "source-7",
                            "storage:42",
                            "boom"));

            assertThat(controller.list(null).notifications().getFirst().documentName())
                    .isEqualTo("march.pdf");
        }

        @Test
        void withholdsTheNameFromAReaderWhoIsNotTheRowsOwner() {
            // A leader reads the team's rows. A colleague's filename is not theirs to read, so the
            // lookup never happens.
            store.record(
                    RecordFailure.forRun(
                            FailureKind.UNKNOWN,
                            TEAM,
                            "someone.else@example.com",
                            "policy-1",
                            "run-1",
                            "source-7",
                            "storage:42",
                            "boom"));

            assertThat(controller.list(null).notifications().getFirst().documentName()).isNull();
            verifyNoInteractions(storedFiles);
        }

        @Test
        void withholdsTheNameWhenTheStoredFileBelongsToSomeoneElse() {
            // The row says the reader raised it; the file says otherwise. A row outlives the file
            // it named, and an id can be reused.
            User someoneElse = new User();
            someoneElse.setUsername("someone.else@example.com");
            StoredFile file = new StoredFile();
            file.setOwner(someoneElse);
            file.setId(42L);
            file.setOriginalFilename("payroll.pdf");
            when(storedFiles.findAllById(Set.of(42L))).thenReturn(List.of(file));
            store.record(
                    RecordFailure.forRun(
                            FailureKind.UNKNOWN,
                            TEAM,
                            ACTOR,
                            "policy-1",
                            "run-1",
                            "source-7",
                            "storage:42",
                            "boom"));

            assertThat(controller.list(null).notifications().getFirst().documentName()).isNull();
        }

        @Test
        void neverNamesADiskFoldersDocument() {
            // Its identity is a path, so the only name available is the last segment of one - the
            // same disclosure by another route.
            store.record(
                    RecordFailure.forRun(
                            FailureKind.UNKNOWN,
                            TEAM,
                            ACTOR,
                            "policy-1",
                            "run-1",
                            "source-7",
                            "/Users/someone/Payroll/march.pdf",
                            "boom"));

            assertThat(controller.list(null).notifications().getFirst().documentName()).isNull();
            verifyNoInteractions(storedFiles);
        }

        @Test
        void putsNoPartOfASourcePathInFrontOfAReader() {
            // Not the directory, not the account, not the filename - including for a team leader,
            // who reads rows that are not theirs.
            store.record(
                    RecordFailure.forRun(
                            FailureKind.UNKNOWN,
                            TEAM,
                            null,
                            "policy-1",
                            "run-1",
                            "source-7",
                            "/Users/someone/Private/Legal/settlement.pdf",
                            "boom"));

            NotificationView notification = controller.list(null).notifications().getFirst();

            assertThat(notification.toString())
                    .doesNotContain("Users", "Private", "Legal", "settlement");
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

    @Nested
    @DisplayName("the response names the viewer, opaquely, for a client to scope read state on")
    class ViewerKey {

        @Test
        void steadyForOneViewerAcrossReads() {
            assertThat(controller.list(null).viewerKey())
                    .isEqualTo(controller.list(null).viewerKey())
                    .isNotBlank();
        }

        @Test
        void differentForAnotherViewerSoOneCannotInheritTheOthersMarker() {
            String mine = controller.list(null).viewerKey();
            when(userService.getCurrentUsername()).thenReturn("someone.else@example.com");

            assertThat(controller.list(null).viewerKey()).isNotEqualTo(mine);
        }

        @Test
        void neverTheUsernameItself() {
            assertThat(controller.list(null).viewerKey()).doesNotContain(ACTOR);
        }
    }
}
