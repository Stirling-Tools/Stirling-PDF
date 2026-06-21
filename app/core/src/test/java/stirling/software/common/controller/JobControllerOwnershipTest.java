package stirling.software.common.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.StickyMissRecorder;
import stirling.software.common.model.job.JobResult;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;

/**
 * Sticky-410 ownership contract for {@link JobController}: peer-owned jobs return 410 Gone with
 * ownedBy/currentNode fields; locally-owned and no-entry cases return 200. FileStorage is never
 * touched on the 410 path. Manual mock construction so tests can vary backplane/jobstore combos.
 */
class JobControllerOwnershipTest {

    private TaskManager taskManager;
    private FileStorage fileStorage;
    private JobQueue jobQueue;
    private HttpServletRequest request;
    private JobOwnershipService jobOwnershipService;
    private ClusterBackplane clusterBackplane;
    private JobStore jobStore;
    private StickyMissRecorder stickyMissRecorder;

    private static final String JOB_ID = "job-42";
    private static final String FILE_ID = "file-abc";
    private static final String LOCAL_NODE = "node-self";
    private static final String PEER_NODE = "node-peer";

    @BeforeEach
    void setUp() {
        taskManager = mock(TaskManager.class);
        fileStorage = mock(FileStorage.class);
        jobQueue = mock(JobQueue.class);
        request = mock(HttpServletRequest.class);
        jobOwnershipService = mock(JobOwnershipService.class);
        clusterBackplane = mock(ClusterBackplane.class);
        jobStore = mock(JobStore.class);
        stickyMissRecorder = mock(StickyMissRecorder.class);
    }

    private JobController makeController(ClusterBackplane backplane, JobStore store) {
        JobController c =
                new JobController(taskManager, fileStorage, jobQueue, request, backplane, store);
        ReflectionTestUtils.setField(c, "stickyMissRecorder", stickyMissRecorder);
        return c;
    }

    private JobController makeController() {
        return makeController(clusterBackplane, jobStore);
    }

    private JobStoreEntry entryOwnedBy(String ownerNodeId) {
        return new JobStoreEntry(
                JOB_ID,
                JobStoreEntry.JobState.COMPLETE,
                ownerNodeId,
                Instant.now(),
                Instant.now(),
                null,
                List.of(FILE_ID),
                Map.of());
    }

    private JobResult completedJobWithFile() {
        JobResult result = new JobResult();
        result.setJobId(JOB_ID);
        // completeWithSingleFile populates the resultFiles list, sets complete=true,
        // and sets completedAt - all required for the getJobResult single-file branch.
        result.completeWithSingleFile(FILE_ID, "out.pdf", "application/pdf", 7L);
        return result;
    }

    @Test
    @DisplayName(
            "downloadFile peer-owned → full sticky-410 contract"
                    + " (status + Retry-After + payload + metric + storage untouched)")
    void downloadFile_peerOwned_fullStickyContract() throws Exception {
        when(clusterBackplane.localNodeId()).thenReturn(LOCAL_NODE);
        when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
        when(jobStore.get(JOB_ID)).thenReturn(Optional.of(entryOwnedBy(PEER_NODE)));

        ResponseEntity<?> response = makeController().downloadFile(FILE_ID);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        assertEquals("0", response.getHeaders().getFirst("Retry-After"));

        assertInstanceOf(Map.class, response.getBody());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals(3, body.size(), "exactly: message, ownedBy, currentNode");
        assertEquals(PEER_NODE, body.get("ownedBy"));
        assertEquals(LOCAL_NODE, body.get("currentNode"));
        assertNotNull(body.get("message"));
        assertTrue(((String) body.get("message")).toLowerCase().contains("retry"));
        assertNull(body.get("internalSecret"));
        assertNull(body.get("filePath"));
        verify(stickyMissRecorder).recordStickyMiss();
        verify(fileStorage, never()).retrieveBytes(FILE_ID);
    }

    private static Stream<Arguments> downloadHappyPathScenarios() {
        return Stream.of(
                Arguments.of("locallyOwned", LOCAL_NODE, true),
                Arguments.of("noJobStoreEntry", null, false),
                Arguments.of("blankOwningNodeId", "", true));
    }

    @ParameterizedTest(name = "downloadFile {0} -> 200, no sticky-miss")
    @MethodSource("downloadHappyPathScenarios")
    void downloadFile_happyPath_returnsOkAndNoMetric(
            String scenario, String ownerNodeId, boolean entryPresent) throws Exception {
        when(clusterBackplane.localNodeId()).thenReturn(LOCAL_NODE);
        when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
        when(jobStore.get(JOB_ID))
                .thenReturn(
                        entryPresent ? Optional.of(entryOwnedBy(ownerNodeId)) : Optional.empty());
        when(fileStorage.retrieveBytes(FILE_ID)).thenReturn("payload".getBytes());

        ResponseEntity<?> response = makeController().downloadFile(FILE_ID);

        assertEquals(HttpStatus.OK, response.getStatusCode(), scenario);
        verify(fileStorage).retrieveBytes(FILE_ID);
        verify(stickyMissRecorder, never()).recordStickyMiss();
    }

    @Test
    @DisplayName("getJobResult: locally-owned single-file result → reads from FileStorage, 200 OK")
    void getJobResult_singleFile_locallyOwned_readsFromStorage() throws Exception {
        when(clusterBackplane.localNodeId()).thenReturn(LOCAL_NODE);
        when(taskManager.getJobResult(JOB_ID)).thenReturn(completedJobWithFile());
        when(jobStore.get(JOB_ID)).thenReturn(Optional.of(entryOwnedBy(LOCAL_NODE)));
        when(fileStorage.retrieveBytes(FILE_ID)).thenReturn("payload".getBytes());

        ResponseEntity<?> response = makeController().getJobResult(JOB_ID);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    private enum Endpoint {
        DOWNLOAD_FILE,
        GET_JOB_RESULT,
        GET_JOB_STATUS,
        GET_JOB_FILES,
        GET_FILE_METADATA,
        CANCEL_JOB
    }

    private static Stream<Arguments> peerOwned410Scenarios() {
        return Stream.of(
                Arguments.of(Endpoint.DOWNLOAD_FILE),
                Arguments.of(Endpoint.GET_JOB_RESULT),
                Arguments.of(Endpoint.GET_JOB_STATUS),
                Arguments.of(Endpoint.GET_JOB_FILES),
                Arguments.of(Endpoint.GET_FILE_METADATA),
                Arguments.of(Endpoint.CANCEL_JOB));
    }

    @ParameterizedTest(name = "{0} peer-owned -> 410, ownedBy=peer, metric++")
    @MethodSource("peerOwned410Scenarios")
    void endpoint_peerOwned_returns410(Endpoint endpoint) throws Exception {
        when(clusterBackplane.localNodeId()).thenReturn(LOCAL_NODE);
        when(jobStore.get(JOB_ID)).thenReturn(Optional.of(entryOwnedBy(PEER_NODE)));
        switch (endpoint) {
            case DOWNLOAD_FILE, GET_FILE_METADATA ->
                    when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
            case GET_JOB_RESULT ->
                    when(taskManager.getJobResult(JOB_ID)).thenReturn(completedJobWithFile());
            case GET_JOB_STATUS, GET_JOB_FILES ->
                    when(taskManager.getJobResult(JOB_ID)).thenReturn(null);
            case CANCEL_JOB -> {
                when(jobQueue.isJobQueued(JOB_ID)).thenReturn(false);
                when(taskManager.getJobResult(JOB_ID)).thenReturn(null);
            }
        }

        ResponseEntity<?> response =
                switch (endpoint) {
                    case DOWNLOAD_FILE -> makeController().downloadFile(FILE_ID);
                    case GET_JOB_RESULT -> makeController().getJobResult(JOB_ID);
                    case GET_JOB_STATUS -> makeController().getJobStatus(JOB_ID);
                    case GET_JOB_FILES -> makeController().getJobFiles(JOB_ID);
                    case GET_FILE_METADATA -> makeController().getFileMetadata(FILE_ID);
                    case CANCEL_JOB -> makeController().cancelJob(JOB_ID);
                };

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals(PEER_NODE, body.get("ownedBy"));
        assertEquals(LOCAL_NODE, body.get("currentNode"));
        verify(stickyMissRecorder).recordStickyMiss();
        verify(fileStorage, never()).retrieveBytes(FILE_ID);
        if (endpoint == Endpoint.CANCEL_JOB) {
            verify(taskManager, never()).setError(JOB_ID, "Job was cancelled by user");
        }
    }

    private static Stream<Arguments> unknownJob404Scenarios() {
        return Stream.of(Arguments.of(Endpoint.GET_JOB_STATUS), Arguments.of(Endpoint.CANCEL_JOB));
    }

    @ParameterizedTest(name = "{0} unknown jobId -> 404 (not 410), no metric")
    @MethodSource("unknownJob404Scenarios")
    void endpoint_unknownJob_returns404(Endpoint endpoint) {
        when(taskManager.getJobResult(JOB_ID)).thenReturn(null);
        when(jobStore.get(JOB_ID)).thenReturn(Optional.empty());
        if (endpoint == Endpoint.CANCEL_JOB) {
            when(jobQueue.isJobQueued(JOB_ID)).thenReturn(false);
        }

        ResponseEntity<?> response =
                switch (endpoint) {
                    case GET_JOB_STATUS -> makeController().getJobStatus(JOB_ID);
                    case CANCEL_JOB -> makeController().cancelJob(JOB_ID);
                    default -> throw new IllegalArgumentException(endpoint.name());
                };

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(stickyMissRecorder, never()).recordStickyMiss();
    }

    @Test
    @DisplayName("Single-instance install (no ClusterBackplane bean): no 410, no NPE")
    void singleInstance_noClusterBackplane_noGoneResponse() throws Exception {
        when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
        when(fileStorage.retrieveBytes(FILE_ID)).thenReturn("payload".getBytes());

        ResponseEntity<?> response = makeController(null, jobStore).downloadFile(FILE_ID);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(fileStorage).retrieveBytes(FILE_ID);
    }

    @Test
    @DisplayName("Single-instance install (no JobStore bean): no 410, no NPE")
    void singleInstance_noJobStore_noGoneResponse() throws Exception {
        when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
        when(fileStorage.retrieveBytes(FILE_ID)).thenReturn("payload".getBytes());

        ResponseEntity<?> response = makeController(clusterBackplane, null).downloadFile(FILE_ID);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(fileStorage).retrieveBytes(FILE_ID);
    }

    @Test
    @DisplayName("Single-instance (no StickyMissRecorder bean) → no NPE, still 200 OK")
    void noStickyMissRecorder_works() throws Exception {
        when(clusterBackplane.localNodeId()).thenReturn(LOCAL_NODE);
        when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
        when(jobStore.get(JOB_ID)).thenReturn(Optional.of(entryOwnedBy(LOCAL_NODE)));
        when(fileStorage.retrieveBytes(FILE_ID)).thenReturn("payload".getBytes());

        JobController c = makeController();
        ReflectionTestUtils.setField(c, "stickyMissRecorder", null);

        ResponseEntity<?> response = c.downloadFile(FILE_ID);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    @DisplayName(
            "cluster-mode but localNodeId is null → no NPE; 410 because owner is set and"
                    + " differs from blank")
    void clusterBackplanePresent_butLocalNodeIdNull_falsBackGracefully() throws Exception {
        when(clusterBackplane.localNodeId()).thenReturn(null);
        when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
        when(jobStore.get(JOB_ID)).thenReturn(Optional.of(entryOwnedBy(PEER_NODE)));

        // We still 410: owner is "node-peer", local is null → they don't match. Rather than
        // silently 200-from-wrong-disk (which would serve garbage), we surface the mismatch.
        ResponseEntity<?> response = makeController().downloadFile(FILE_ID);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals("", body.get("currentNode"), "blank when localNodeId is null");
        assertEquals(PEER_NODE, body.get("ownedBy"));
    }

    @Test
    @DisplayName("Owner returns 410 even when JobOwnershipService allows access (orthogonal)")
    void ownershipService_passes_butStickyStillReturns410() throws Exception {
        when(clusterBackplane.localNodeId()).thenReturn(LOCAL_NODE);
        when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
        when(jobStore.get(JOB_ID)).thenReturn(Optional.of(entryOwnedBy(PEER_NODE)));
        lenient().when(jobOwnershipService.validateJobAccess(JOB_ID)).thenReturn(true);

        JobController c = makeController();
        ReflectionTestUtils.setField(c, "jobOwnershipService", jobOwnershipService);
        ResponseEntity<?> response = c.downloadFile(FILE_ID);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
    }

    @Test
    @DisplayName(
            "downloadFile: peer-owned + ownership-denied → 410 (NOT 403) so we don't leak"
                    + " file existence")
    void downloadFile_peerOwned_ownershipDenied_returns410NotForbidden() throws Exception {
        when(clusterBackplane.localNodeId()).thenReturn(LOCAL_NODE);
        when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
        when(jobStore.get(JOB_ID)).thenReturn(Optional.of(entryOwnedBy(PEER_NODE)));
        lenient().when(jobOwnershipService.validateJobAccess(JOB_ID)).thenReturn(false);

        JobController c = makeController();
        ReflectionTestUtils.setField(c, "jobOwnershipService", jobOwnershipService);
        ResponseEntity<?> response = c.downloadFile(FILE_ID);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals(PEER_NODE, body.get("ownedBy"));
        verify(fileStorage, never()).retrieveBytes(FILE_ID);
    }

    @Test
    @DisplayName(
            "getJobStatus: peer-owned + ownership-denied → 410 (NOT 403) so we don't leak"
                    + " job existence")
    void getJobStatus_peerOwned_ownershipDenied_returns410NotForbidden() {
        when(clusterBackplane.localNodeId()).thenReturn(LOCAL_NODE);
        when(jobStore.get(JOB_ID)).thenReturn(Optional.of(entryOwnedBy(PEER_NODE)));
        lenient().when(jobOwnershipService.validateJobAccess(JOB_ID)).thenReturn(false);

        JobController c = makeController();
        ReflectionTestUtils.setField(c, "jobOwnershipService", jobOwnershipService);
        ResponseEntity<?> response = c.getJobStatus(JOB_ID);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals(PEER_NODE, body.get("ownedBy"));
    }

    @Test
    @DisplayName(
            "cancelJob: peer-owned + ownership-denied → 410 (NOT 403) so we don't leak job"
                    + " existence")
    void cancelJob_peerOwned_ownershipDenied_returns410NotForbidden() {
        when(clusterBackplane.localNodeId()).thenReturn(LOCAL_NODE);
        when(jobQueue.isJobQueued(JOB_ID)).thenReturn(false);
        when(jobStore.get(JOB_ID)).thenReturn(Optional.of(entryOwnedBy(PEER_NODE)));
        lenient().when(jobOwnershipService.validateJobAccess(JOB_ID)).thenReturn(false);

        JobController c = makeController();
        ReflectionTestUtils.setField(c, "jobOwnershipService", jobOwnershipService);
        ResponseEntity<?> response = c.cancelJob(JOB_ID);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertEquals(PEER_NODE, body.get("ownedBy"));
        verify(taskManager, never()).setError(JOB_ID, "Job was cancelled by user");
    }

    @Test
    @DisplayName(
            "guardNonOwner caches JobStore.get within TTL window: second call same jobId hits"
                    + " cache, not Valkey")
    void guardNonOwner_cachesJobStoreLookupWithinTtl() throws Exception {
        when(clusterBackplane.localNodeId()).thenReturn(LOCAL_NODE);
        when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
        when(jobStore.get(JOB_ID)).thenReturn(Optional.of(entryOwnedBy(LOCAL_NODE)));
        when(fileStorage.retrieveBytes(FILE_ID)).thenReturn("payload".getBytes());

        JobController c = makeController();
        c.downloadFile(FILE_ID);
        c.downloadFile(FILE_ID);
        c.downloadFile(FILE_ID);

        verify(jobStore, times(1)).get(JOB_ID);
    }

    @Test
    @DisplayName(
            "guardNonOwner: JobStore.get throws (Valkey timeout) → falls through to local-disk"
                    + " path, no 500 leaks to caller")
    void guardNonOwner_jobStoreException_fallsThroughToLocalPath() throws Exception {
        when(taskManager.findJobKeyByFileId(FILE_ID)).thenReturn(JOB_ID);
        when(jobStore.get(JOB_ID)).thenThrow(new RuntimeException("Valkey command timeout"));
        when(taskManager.getJobResult(JOB_ID)).thenReturn(completedJobWithFile());
        when(fileStorage.retrieveBytes(FILE_ID)).thenReturn("payload".getBytes());

        ResponseEntity<?> response = makeController().downloadFile(FILE_ID);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(fileStorage).retrieveBytes(FILE_ID);
        verify(stickyMissRecorder, never()).recordStickyMiss();
    }

    @Test
    @DisplayName("backplane down + job NOT held locally → 503 retryable (not a misleading 404)")
    void jobEndpoint_backplaneDown_notLocal_returns503() {
        when(jobStore.get(JOB_ID)).thenThrow(new RuntimeException("Valkey command timeout"));
        when(taskManager.getJobResult(JOB_ID)).thenReturn(null);

        ResponseEntity<?> response = makeController().getJobStatus(JOB_ID);

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        assertEquals("1", response.getHeaders().getFirst("Retry-After"));
        verify(stickyMissRecorder, never()).recordStickyMiss();
    }

    @Test
    @DisplayName("backplane down but job held locally → owner still serves (not 503)")
    void jobEndpoint_backplaneDown_local_servesLocally() {
        when(jobStore.get(JOB_ID)).thenThrow(new RuntimeException("Valkey command timeout"));
        when(taskManager.getJobResult(JOB_ID)).thenReturn(completedJobWithFile());

        ResponseEntity<?> response = makeController().getJobStatus(JOB_ID);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    @DisplayName(
            "downloadFile: findJobKeyByFileId throws (backplane down) → 503 + Retry-After,"
                    + " not 404/500, storage untouched")
    void downloadFile_findJobKeyThrows_returns503Retryable() throws Exception {
        when(taskManager.findJobKeyByFileId(FILE_ID))
                .thenThrow(new RuntimeException("Valkey command timeout"));

        ResponseEntity<?> response = makeController().downloadFile(FILE_ID);

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        assertEquals("1", response.getHeaders().getFirst("Retry-After"));
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertTrue(((String) body.get("message")).toLowerCase().contains("unavailable"));
        verify(fileStorage, never()).retrieveBytes(FILE_ID);
    }

    @Test
    @DisplayName(
            "getFileMetadata: findJobKeyByFileId throws (backplane down) → 503 + Retry-After,"
                    + " not 404/500")
    void getFileMetadata_findJobKeyThrows_returns503Retryable() throws Exception {
        when(taskManager.findJobKeyByFileId(FILE_ID))
                .thenThrow(new RuntimeException("Valkey command timeout"));

        ResponseEntity<?> response = makeController().getFileMetadata(FILE_ID);

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        assertEquals("1", response.getHeaders().getFirst("Retry-After"));
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertTrue(((String) body.get("message")).toLowerCase().contains("unavailable"));
        verify(fileStorage, never()).retrieveBytes(FILE_ID);
    }
}
