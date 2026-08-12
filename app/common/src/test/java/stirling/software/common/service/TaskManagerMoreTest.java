package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.cluster.JobStore;
import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.JobStats;
import stirling.software.common.model.job.ResultFile;

/** Additional coverage for TaskManager branches not exercised by TaskManagerTest. */
class TaskManagerMoreTest {

    @Mock private FileStorage fileStorage;
    @Mock private JobStore jobStore;
    @Mock private ClusterBackplane clusterBackplane;

    @InjectMocks private TaskManager taskManager;

    private AutoCloseable closeable;

    @BeforeEach
    void setUp() {
        closeable = MockitoAnnotations.openMocks(this);
        lenient().when(clusterBackplane.localNodeId()).thenReturn("test-node");
        lenient().when(clusterBackplane.shouldRunLocalCleanup()).thenReturn(true);
        ReflectionTestUtils.setField(taskManager, "jobResultExpiryMinutes", 30);
    }

    @AfterEach
    void tearDown() throws Exception {
        closeable.close();
    }

    private static byte[] buildZip(String... entryNames) throws Exception {
        var baos = new java.io.ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (String name : entryNames) {
                zos.putNextEntry(new ZipEntry(name));
                zos.write(("content-of-" + name).getBytes());
                zos.closeEntry();
            }
        }
        return baos.toByteArray();
    }

    @Nested
    @DisplayName("setFileResult ZIP handling")
    class ZipHandling {

        @Test
        @DisplayName("extracts a ZIP into individual file results and deletes the original")
        void extractsZipIntoIndividualFiles() throws Exception {
            String jobId = "zip-job";
            taskManager.createTask(jobId);

            byte[] zipBytes = buildZip("a.pdf", "b.txt");
            when(fileStorage.retrieveInputStream("zip-file-id"))
                    .thenReturn(new ByteArrayInputStream(zipBytes));
            // Each extracted entry is stored, returning a distinct StoredFile.
            when(fileStorage.storeInputStream(any(InputStream.class), anyString()))
                    .thenReturn(new FileStorage.StoredFile("extracted-a", 11L))
                    .thenReturn(new FileStorage.StoredFile("extracted-b", 22L));
            when(fileStorage.deleteFile("zip-file-id")).thenReturn(true);

            taskManager.setFileResult(jobId, "zip-file-id", "bundle.zip", "application/zip");

            JobResult result = taskManager.getJobResult(jobId);
            assertThat(result.isComplete()).isTrue();
            assertThat(result.hasMultipleFiles()).isTrue();
            assertThat(result.getAllResultFiles()).hasSize(2);
            // Content type is derived from the entry extension, not the ZIP content type.
            assertThat(result.getAllResultFiles().get(0).getContentType())
                    .isEqualTo(MediaType.APPLICATION_PDF_VALUE);
            assertThat(result.getAllResultFiles().get(1).getContentType())
                    .isEqualTo(MediaType.TEXT_PLAIN_VALUE);
            verify(fileStorage).deleteFile("zip-file-id");
        }

        @Test
        @DisplayName("empty ZIP falls back to a single-file result")
        void emptyZipFallsBackToSingleFile() throws Exception {
            String jobId = "empty-zip-job";
            taskManager.createTask(jobId);

            byte[] emptyZip = buildZip();
            when(fileStorage.retrieveInputStream("empty-zip-id"))
                    .thenReturn(new ByteArrayInputStream(emptyZip));
            when(fileStorage.getFileSize("empty-zip-id")).thenReturn(7L);

            taskManager.setFileResult(jobId, "empty-zip-id", "empty.zip", "application/zip");

            JobResult result = taskManager.getJobResult(jobId);
            assertThat(result.hasMultipleFiles()).isFalse();
            assertThat(result.getAllResultFiles()).hasSize(1);
            assertThat(result.getAllResultFiles().get(0).getFileId()).isEqualTo("empty-zip-id");
        }

        @Test
        @DisplayName("ZIP extraction failure falls back to a single-file result")
        void zipExtractionFailureFallsBackToSingleFile() throws Exception {
            String jobId = "bad-zip-job";
            taskManager.createTask(jobId);

            // retrieveInputStream throws so extractZipToIndividualFiles fails and we fall back.
            when(fileStorage.retrieveInputStream("bad-zip-id"))
                    .thenThrow(new java.io.IOException("boom"));
            when(fileStorage.getFileSize("bad-zip-id")).thenReturn(99L);

            taskManager.setFileResult(
                    jobId, "bad-zip-id", "broken.zip", "application/x-zip-compressed");

            JobResult result = taskManager.getJobResult(jobId);
            assertThat(result.hasFiles()).isTrue();
            assertThat(result.getAllResultFiles().get(0).getFileId()).isEqualTo("bad-zip-id");
        }
    }

    @Nested
    @DisplayName("setFileResult size fallback")
    class SizeFallback {

        @Test
        @DisplayName("uses size 0 when getFileSize throws for a non-zip file")
        void usesZeroSizeWhenGetFileSizeThrows() throws Exception {
            String jobId = "size-fail-job";
            taskManager.createTask(jobId);
            when(fileStorage.getFileSize("file-x")).thenThrow(new java.io.IOException("no stat"));

            taskManager.setFileResult(jobId, "file-x", "doc.pdf", MediaType.APPLICATION_PDF_VALUE);

            JobResult result = taskManager.getJobResult(jobId);
            assertThat(result.getAllResultFiles().get(0).getFileSize()).isZero();
        }
    }

    @Nested
    @DisplayName("setMultipleFileResults")
    class MultipleFileResults {

        @Test
        @DisplayName("stores the provided list directly")
        void storesProvidedList() {
            String jobId = "multi-job";
            taskManager.createTask(jobId);
            List<ResultFile> files =
                    List.of(
                            ResultFile.builder().fileId("f1").fileName("1.pdf").build(),
                            ResultFile.builder().fileId("f2").fileName("2.pdf").build());

            taskManager.setMultipleFileResults(jobId, files);

            JobResult result = taskManager.getJobResult(jobId);
            assertThat(result.hasMultipleFiles()).isTrue();
            assertThat(result.getAllResultFiles()).hasSize(2);
        }
    }

    @Nested
    @DisplayName("getJobStats edge cases")
    class StatsEdgeCases {

        @Test
        @DisplayName("empty manager reports zero average processing time")
        void emptyManagerZeroAverage() {
            JobStats stats = taskManager.getJobStats();
            assertThat(stats.getTotalJobs()).isZero();
            assertThat(stats.getAverageProcessingTimeMs()).isZero();
            assertThat(stats.getOldestActiveJobTime()).isNull();
        }

        @Test
        @DisplayName("accumulates processing time across multiple completed jobs")
        void accumulatesProcessingTime() {
            taskManager.createTask("c1");
            taskManager.setResult("c1", "r1");
            taskManager.createTask("c2");
            taskManager.setResult("c2", "r2");

            JobStats stats = taskManager.getJobStats();
            assertThat(stats.getCompletedJobs()).isEqualTo(2);
            assertThat(stats.getSuccessfulJobs()).isEqualTo(2);
            assertThat(stats.getAverageProcessingTimeMs()).isGreaterThanOrEqualTo(0);
        }
    }

    @Nested
    @DisplayName("findResultFileByFileId")
    class FindResultFile {

        @Test
        @DisplayName("returns matching ResultFile metadata")
        void returnsMatch() throws Exception {
            taskManager.createTask("rf-job");
            when(fileStorage.getFileSize("target")).thenReturn(5L);
            taskManager.setFileResult("rf-job", "target", "t.pdf", MediaType.APPLICATION_PDF_VALUE);

            ResultFile found = taskManager.findResultFileByFileId("target");
            assertThat(found).isNotNull();
            assertThat(found.getFileId()).isEqualTo("target");
        }

        @Test
        @DisplayName("returns null when no job owns the file id")
        void returnsNullWhenAbsent() {
            assertThat(taskManager.findResultFileByFileId("nope")).isNull();
        }
    }

    @Nested
    @DisplayName("findJobKeyByFileId")
    class FindJobKey {

        @Test
        @DisplayName("returns the local job key when a job owns the file id")
        void returnsLocalKey() throws Exception {
            taskManager.createTask("owner-job");
            when(fileStorage.getFileSize("owned")).thenReturn(3L);
            taskManager.setFileResult(
                    "owner-job", "owned", "o.pdf", MediaType.APPLICATION_PDF_VALUE);

            assertThat(taskManager.findJobKeyByFileId("owned")).isEqualTo("owner-job");
            // Local hit must not consult the JobStore.
            verify(jobStore, never()).findJobIdByFileId(anyString());
        }

        @Test
        @DisplayName("returns null when JobStore also has no match")
        void returnsNullWhenJobStoreEmpty() {
            when(jobStore.findJobIdByFileId("ghost")).thenReturn(Optional.empty());
            assertThat(taskManager.findJobKeyByFileId("ghost")).isNull();
        }

        @Test
        @DisplayName("propagates JobStore lookup failures instead of returning null")
        void propagatesJobStoreFailure() {
            when(jobStore.findJobIdByFileId("blip"))
                    .thenThrow(new RuntimeException("backplane down"));
            assertThatThrownBy(() -> taskManager.findJobKeyByFileId("blip"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("backplane down");
        }
    }

    @Nested
    @DisplayName("cleanupOldJobs resilience")
    class CleanupResilience {

        @Test
        @DisplayName("continues when a file deletion throws during cleanup")
        void continuesWhenDeleteThrows() throws Exception {
            String jobId = "old-file-job";
            taskManager.createTask(jobId);
            JobResult job = taskManager.getJobResult(jobId);
            ResultFile rf =
                    ResultFile.builder()
                            .fileId("doomed")
                            .fileName("d.pdf")
                            .contentType(MediaType.APPLICATION_PDF_VALUE)
                            .fileSize(1L)
                            .build();
            ReflectionTestUtils.setField(job, "resultFiles", List.of(rf));
            ReflectionTestUtils.setField(job, "complete", true);
            ReflectionTestUtils.setField(job, "completedAt", LocalDateTime.now().minusHours(2));

            when(fileStorage.deleteFile("doomed")).thenThrow(new RuntimeException("locked"));

            // Must not propagate; the job is still removed afterwards.
            taskManager.cleanupOldJobs();

            @SuppressWarnings("unchecked")
            Map<String, JobResult> map =
                    (Map<String, JobResult>)
                            ReflectionTestUtils.getField(taskManager, "jobResults");
            assertThat(map).doesNotContainKey(jobId);
        }
    }

    @Nested
    @DisplayName("write-through failures")
    class WriteThroughFailures {

        @Test
        @DisplayName("a JobStore put failure does not break createTask")
        void putFailureSwallowed() {
            org.mockito.Mockito.doThrow(new RuntimeException("store offline"))
                    .when(jobStore)
                    .put(any(), any());
            // createTask -> writeThrough; the RuntimeException is caught and logged.
            taskManager.createTask("wt-job");
            assertThat(taskManager.getJobResult("wt-job")).isNotNull();
        }
    }

    @Nested
    @DisplayName("toEntry mapping")
    class ToEntryMapping {

        @Test
        @DisplayName("a failed job maps to FAILED state in the JobStore entry")
        void failedJobMapsToFailedState() {
            taskManager.createTask("fail-job");
            taskManager.setError("fail-job", "kaboom");

            var captor =
                    org.mockito.ArgumentCaptor.forClass(
                            stirling.software.common.cluster.JobStoreEntry.class);
            verify(jobStore, org.mockito.Mockito.atLeastOnce()).put(captor.capture(), any());
            assertThat(captor.getValue().jobId()).isEqualTo("fail-job");
            assertThat(captor.getAllValues())
                    .anySatisfy(
                            e ->
                                    assertThat(e.state())
                                            .isEqualTo(
                                                    stirling.software.common.cluster.JobStoreEntry
                                                            .JobState.FAILED));
        }
    }

    @Nested
    @DisplayName("addNote write-through")
    class AddNoteWriteThrough {

        @Test
        @DisplayName("note is reflected in JobStore entry metadata")
        void noteWritesMetadata() {
            taskManager.createTask("note-job");
            assertThat(taskManager.addNote("note-job", "hello")).isTrue();

            var captor =
                    org.mockito.ArgumentCaptor.forClass(
                            stirling.software.common.cluster.JobStoreEntry.class);
            verify(jobStore, org.mockito.Mockito.atLeastOnce()).put(captor.capture(), any());
            assertThat(captor.getAllValues())
                    .anySatisfy(e -> assertThat(e.resultMeta()).containsKey("notesCount"));
        }
    }
}
