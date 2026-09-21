package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;

import stirling.software.common.service.InternalApiClient;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.input.FolderDocuments;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.output.FolderOutputSink;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * {@link FolderDocumentFix} lets a press rewrite a file on the server's disk. What matters: only
 * the row's own document inside a folder the presser owns, and a refused fix leaves it untouched.
 */
@ExtendWith(MockitoExtension.class)
class FolderDocumentFixTest {

    private static final String FOLDER_ID = "policy-folder-1";
    private static final String IDENTITY = "/Users/carol/Downloads/invoice.pdf";
    private static final Path DOCUMENT = Path.of(IDENTITY);
    private static final String REPAIR = "/api/v1/misc/repair";
    private static final String REFUSAL = "That did not work on this document.";

    @Mock private PolicyStore policyStore;
    @Mock private PolicyFailureRecorder failureRecorder;
    @Mock private PolicyAccessGuard policyAccessGuard;
    @Mock private FolderDocuments folderDocuments;
    @Mock private InternalApiClient internalApi;
    @Mock private FolderOutputSink folderOutputSink;
    @Mock private ProcessedLedger processedLedger;
    @Mock private PolicyRunner policyRunner;
    @Mock private FileRunEventStore store;

    private FolderDocumentFix fix;

    @BeforeEach
    void setUp() {
        fix =
                new FolderDocumentFix(
                        policyStore,
                        failureRecorder,
                        policyAccessGuard,
                        folderDocuments,
                        internalApi,
                        folderOutputSink,
                        processedLedger,
                        policyRunner,
                        store);
    }

    private static Policy folder(String surface) {
        return new Policy(
                FOLDER_ID,
                "Downloads",
                "carol",
                true,
                false,
                "",
                List.of(),
                List.of(),
                OutputSpec.inline(),
                List.of(),
                3L,
                null,
                surface,
                List.of());
    }

    private static FileRunEvent event(String policyId, String fileId) {
        return new FileRunEvent(
                "evt-1",
                3L,
                "carol",
                FailureKind.INPUT_CORRUPTED,
                FailureStage.INPUT,
                FailureSeverity.ERROR,
                FailureScope.FILE,
                FailureOrigin.POLICY,
                policyId,
                "run-1",
                "source-1",
                fileId,
                "boom",
                "dedup",
                1,
                FileRunEventStatus.NEW,
                null,
                null,
                null,
                null);
    }

    /** The caller owns the folder and the row's identity resolves inside it. */
    private void grantTheOwnersOwnFolder() {
        when(policyStore.get(FOLDER_ID))
                .thenReturn(Optional.of(folder(Policy.SURFACE_PROCESSING_FOLDER)));
        when(policyAccessGuard.canAccess(any(Policy.class))).thenReturn(true);
        when(folderDocuments.locate(any(Policy.class), eq(IDENTITY)))
                .thenReturn(Optional.of(DOCUMENT));
    }

    /** A tool's coded Problem Details refusal, as RestTemplate raises one. */
    private static HttpClientErrorException coded(String errorCode, String detail) {
        String body =
                "{\"detail\":\""
                        + detail
                        + "\",\"status\":400,\"errorCode\":\""
                        + errorCode
                        + "\"}";
        return HttpClientErrorException.create(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "Bad Request",
                org.springframework.http.HttpHeaders.EMPTY,
                body.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                java.nio.charset.StandardCharsets.UTF_8);
    }

    private static HttpClientErrorException unrepairable() {
        return coded("E076", "This document is damaged in a way the repair tools cannot fix.");
    }

    /** As {@link #event}, for a kind whose own code a refusal might repeat. */
    private static FileRunEvent passwordEvent() {
        return new FileRunEvent(
                "evt-1",
                3L,
                "carol",
                FailureKind.INPUT_PASSWORD_PROTECTED,
                FailureStage.INPUT,
                FailureSeverity.ERROR,
                FailureScope.FILE,
                FailureOrigin.POLICY,
                FOLDER_ID,
                "run-1",
                "source-1",
                IDENTITY,
                "boom",
                "dedup",
                1,
                FileRunEventStatus.NEW,
                null,
                null,
                null,
                null);
    }

    private void toolAnswers(byte[] fixedBytes) {
        when(internalApi.post(anyString(), any()))
                .thenReturn(ResponseEntity.ok(new ByteArrayResource(fixedBytes)));
    }

    @Nested
    @DisplayName("nobody fixes a file in a folder that is not theirs")
    class Authorisation {

        @Test
        void refusesWhenTheGuardDoesNotGrantTheCallerThisFolder() throws Exception {
            // A team leader reading a colleague's row: visible to them, and not theirs to rewrite.
            when(policyStore.get(FOLDER_ID))
                    .thenReturn(Optional.of(folder(Policy.SURFACE_PROCESSING_FOLDER)));
            when(policyAccessGuard.canAccess(any(Policy.class))).thenReturn(false);

            assertThatThrownBy(
                            () ->
                                    fix.fixAndRerun(
                                            event(FOLDER_ID, IDENTITY),
                                            "leader",
                                            REPAIR,
                                            Map.of(),
                                            REFUSAL))
                    .isInstanceOf(FailureActionException.class);

            verifyTheDocumentWasNotTouched();
        }

        @Test
        void refusesARowWhosePolicyIsNotAProcessingFolderAtAll() throws Exception {
            when(policyStore.get(FOLDER_ID)).thenReturn(Optional.of(folder(Policy.SURFACE_POLICY)));

            assertThatThrownBy(
                            () ->
                                    fix.fixAndRerun(
                                            event(FOLDER_ID, IDENTITY),
                                            "carol",
                                            REPAIR,
                                            Map.of(),
                                            REFUSAL))
                    .isInstanceOf(FailureActionException.class);

            verifyTheDocumentWasNotTouched();
        }

        @Test
        void refusesAnIdentityThatResolvesOutsideTheFoldersThisPolicyWatches() throws Exception {
            // The presser's own row, naming a path the policy does not watch: stale, or doctored to
            // point at another's file. Refused as not found, the same answer a missing folder gets.
            when(policyStore.get(FOLDER_ID))
                    .thenReturn(Optional.of(folder(Policy.SURFACE_PROCESSING_FOLDER)));
            when(policyAccessGuard.canAccess(any(Policy.class))).thenReturn(true);
            when(folderDocuments.locate(any(Policy.class), anyString()))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(
                            () ->
                                    fix.fixAndRerun(
                                            event(FOLDER_ID, "/etc/shadow"),
                                            "carol",
                                            REPAIR,
                                            Map.of(),
                                            REFUSAL))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.EVENT_NOT_FOUND);

            verifyTheDocumentWasNotTouched();
        }

        @Test
        void refusesARowThatNamesNoDocument() throws Exception {
            when(policyStore.get(FOLDER_ID))
                    .thenReturn(Optional.of(folder(Policy.SURFACE_PROCESSING_FOLDER)));
            when(policyAccessGuard.canAccess(any(Policy.class))).thenReturn(true);

            assertThatThrownBy(
                            () ->
                                    fix.fixAndRerun(
                                            event(FOLDER_ID, null),
                                            "carol",
                                            REPAIR,
                                            Map.of(),
                                            REFUSAL))
                    .isInstanceOf(FailureActionException.class);

            verifyTheDocumentWasNotTouched();
        }

        private void verifyTheDocumentWasNotTouched() throws Exception {
            verify(internalApi, never()).post(anyString(), any());
            verify(folderOutputSink, never()).replaceInPlace(any(), any());
            verify(policyRunner, never()).runFile(any(), anyString());
        }
    }

    @Nested
    @DisplayName("the owner's own folder")
    class Owner {

        @Test
        void fixesTheFileTheRowNamesAndRunsThePolicyOnItAgain() throws Exception {
            grantTheOwnersOwnFolder();
            toolAnswers("fixed".getBytes());
            when(store.applyStatus(any(), any(), any(), any()))
                    .thenReturn(mock(FileRunEvent.class));

            fix.fixAndRerun(event(FOLDER_ID, IDENTITY), "carol", REPAIR, Map.of(), REFUSAL);

            ArgumentCaptor<Resource> written = ArgumentCaptor.forClass(Resource.class);
            verify(folderOutputSink).replaceInPlace(eq(DOCUMENT), written.capture());
            assertThat(written.getValue().getInputStream().readAllBytes())
                    .isEqualTo("fixed".getBytes());
            verify(policyRunner).runFile(any(Policy.class), eq(IDENTITY));
            verify(store)
                    .applyStatus(eq("evt-1"), eq(3L), eq(FileRunEventStatus.RESOLVED), eq("carol"));
        }

        @Test
        void sendsTheDocumentAndTheActionsOwnParametersToTheTool() {
            grantTheOwnersOwnFolder();
            toolAnswers("unlocked".getBytes());
            when(store.applyStatus(any(), any(), any(), any()))
                    .thenReturn(mock(FileRunEvent.class));

            fix.fixAndRerun(
                    event(FOLDER_ID, IDENTITY),
                    "carol",
                    "/api/v1/security/remove-password",
                    Map.of("password", "hunter2"),
                    REFUSAL);

            ArgumentCaptor<MultiValueMap<String, Object>> body =
                    ArgumentCaptor.forClass(MultiValueMap.class);
            verify(internalApi).post(eq("/api/v1/security/remove-password"), body.capture());
            assertThat(body.getValue().getFirst("fileInput")).isNotNull();
            assertThat(body.getValue().getFirst("password")).isEqualTo("hunter2");
        }

        @Test
        void leavesTheDocumentAloneWhenTheToolDeclinesIt() throws Exception {
            // A wrong password or damage past repairing. The file on the user's disk must be
            // exactly as it was, and the row must stay open so they can try again.
            grantTheOwnersOwnFolder();
            when(internalApi.post(anyString(), any()))
                    .thenThrow(
                            HttpClientErrorException.create(
                                    org.springframework.http.HttpStatus.BAD_REQUEST,
                                    "Bad Request",
                                    org.springframework.http.HttpHeaders.EMPTY,
                                    new byte[0],
                                    null));

            assertThatThrownBy(
                            () ->
                                    fix.fixAndRerun(
                                            event(FOLDER_ID, IDENTITY),
                                            "carol",
                                            REPAIR,
                                            Map.of(),
                                            REFUSAL))
                    .isInstanceOf(FailureActionException.class)
                    .extracting(e -> ((FailureActionException) e).getReason())
                    .isEqualTo(FailureActionException.Reason.FIX_FAILED);

            verify(folderOutputSink, never()).replaceInPlace(any(), any());
            verify(processedLedger, never()).forgetFailure(anyString(), anyString());
            verify(policyRunner, never()).runFile(any(), anyString());
            verify(store, never()).applyStatus(any(), any(), any(), any());
        }

        @Test
        void replacesTheRowWhenTheToolSaysSomethingItsKindDoesNot() throws Exception {
            // Repair tried and definitively refused: the document is unrepairable, which offers no
            // repair. Without this the same button sits there, failing the same way on every press.
            grantTheOwnersOwnFolder();
            when(internalApi.post(anyString(), any())).thenThrow(unrepairable());

            assertThatThrownBy(
                            () ->
                                    fix.fixAndRerun(
                                            event(FOLDER_ID, IDENTITY),
                                            "carol",
                                            REPAIR,
                                            Map.of(),
                                            REFUSAL))
                    .isInstanceOf(FailureActionException.class);

            verify(failureRecorder)
                    .recordDocumentFailureAs(
                            eq(FailureKind.INPUT_UNREPAIRABLE), any(FileRunEvent.class), any());
            verify(store)
                    .applyStatus(eq("evt-1"), eq(3L), eq(FileRunEventStatus.RESOLVED), eq("carol"));
            // The document is untouched: nothing was produced to put back.
            verify(folderOutputSink, never()).replaceInPlace(any(), any());
        }

        @Test
        void keepsTheRowWhenTheRefusalIsTheFactItAlreadyCarries() {
            // A wrong password on a password-protected row says nothing new, and the owner has to
            // be able to try again with the right one.
            grantTheOwnersOwnFolder();
            when(internalApi.post(anyString(), any())).thenThrow(coded("E004", "Wrong password"));

            assertThatThrownBy(
                            () ->
                                    fix.fixAndRerun(
                                            passwordEvent(),
                                            "carol",
                                            "/api/v1/security/remove-password",
                                            Map.of("password", "wrong"),
                                            REFUSAL))
                    .isInstanceOf(FailureActionException.class);

            verify(failureRecorder, never())
                    .recordDocumentFailureAs(any(), any(FileRunEvent.class), any());
            verify(store, never()).applyStatus(any(), any(), any(), any());
        }

        @Test
        void keepsTheRowWhenTheToolNeverAnswered() {
            // No response to read a verdict from says nothing about the document, so the offer
            // must survive a tool that was merely down.
            grantTheOwnersOwnFolder();
            when(internalApi.post(anyString(), any()))
                    .thenThrow(new org.springframework.web.client.ResourceAccessException("down"));

            assertThatThrownBy(
                            () ->
                                    fix.fixAndRerun(
                                            event(FOLDER_ID, IDENTITY),
                                            "carol",
                                            REPAIR,
                                            Map.of(),
                                            REFUSAL))
                    .isInstanceOf(FailureActionException.class);

            verify(failureRecorder, never())
                    .recordDocumentFailureAs(any(), any(FileRunEvent.class), any());
            verify(store, never()).applyStatus(any(), any(), any(), any());
        }

        @Test
        void saysWhatTheActionSaysRatherThanWhatTheToolSaid() {
            // A tool's own wording can name the temp path it was working on, and this answer goes
            // straight into a notification.
            grantTheOwnersOwnFolder();
            when(internalApi.post(anyString(), any()))
                    .thenThrow(
                            HttpClientErrorException.create(
                                    org.springframework.http.HttpStatus.BAD_REQUEST,
                                    "Bad Request",
                                    org.springframework.http.HttpHeaders.EMPTY,
                                    "/tmp/internal-api-4823.pdf is not a PDF"
                                            .getBytes(java.nio.charset.StandardCharsets.UTF_8),
                                    null));

            assertThatThrownBy(
                            () ->
                                    fix.fixAndRerun(
                                            event(FOLDER_ID, IDENTITY),
                                            "carol",
                                            REPAIR,
                                            Map.of(),
                                            REFUSAL))
                    .hasMessage(REFUSAL)
                    .hasMessageNotContaining("/tmp/");
        }

        @Test
        void stillRunsThePolicyWhenAnotherPressAlreadyClearedTheParkedFailure() throws Exception {
            // The fix is already spent and the file already rewritten, so refusing here would
            // leave a fixed document sitting unprocessed.
            grantTheOwnersOwnFolder();
            toolAnswers("fixed".getBytes());
            when(processedLedger.forgetFailure(FOLDER_ID, IDENTITY)).thenReturn(false);
            when(store.applyStatus(any(), any(), any(), any()))
                    .thenReturn(mock(FileRunEvent.class));

            fix.fixAndRerun(event(FOLDER_ID, IDENTITY), "carol", REPAIR, Map.of(), REFUSAL);

            verify(policyRunner).runFile(any(Policy.class), eq(IDENTITY));
        }
    }
}
