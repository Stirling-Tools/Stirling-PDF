package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.common.model.job.JobResponse;
import stirling.software.common.util.ExceptionUtils;

/** Additional coverage for JobExecutorService branches not exercised by JobExecutorServiceTest. */
@ExtendWith(MockitoExtension.class)
class JobExecutorServiceMoreTest {

    private JobExecutorService service;

    @Mock private TaskManager taskManager;
    @Mock private FileStorage fileStorage;
    @Mock private ResourceMonitor resourceMonitor;
    @Mock private JobQueue jobQueue;

    @BeforeEach
    void setUp() {
        // request is null on purpose to exercise the request==null guard.
        service =
                new JobExecutorService(
                        taskManager, fileStorage, null, resourceMonitor, jobQueue, 30000L, "30m");
    }

    /** Concrete validation exception so we can drive the BaseValidationException rethrow branch. */
    private static class TestValidationException extends ExceptionUtils.BaseValidationException {
        TestValidationException(String message) {
            super(message, "E999");
        }
    }

    /** Concrete app exception so we can drive the BaseAppException rethrow branch. */
    private static class TestAppException extends ExceptionUtils.BaseAppException {
        TestAppException(String message) {
            super(message, null, "E998");
        }
    }

    /** Bean exposing getFileId/getOriginalFilename/getContentType for the reflection branch. */
    public static class FileIdBean {
        private final String fileId;
        private final String originalFilename;
        private final String contentType;

        FileIdBean(String fileId, String originalFilename, String contentType) {
            this.fileId = fileId;
            this.originalFilename = originalFilename;
            this.contentType = contentType;
        }

        public String getFileId() {
            return fileId;
        }

        public String getOriginalFilename() {
            return originalFilename;
        }

        public String getContentType() {
            return contentType;
        }

        @Override
        public String toString() {
            return "FileIdBean{fileId=" + fileId + "}";
        }
    }

    @Nested
    @DisplayName("synchronous error mapping")
    class SyncErrors {

        @Test
        @DisplayName("IllegalArgumentException is rethrown, not wrapped in a 500 body")
        void illegalArgumentRethrown() {
            Supplier<Object> work =
                    () -> {
                        throw new IllegalArgumentException("bad input");
                    };
            assertThatThrownBy(() -> service.runJobGeneric(false, work))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("bad input");
        }

        @Test
        @DisplayName("a cause of BaseValidationException is rethrown")
        void validationCauseRethrown() {
            Supplier<Object> work =
                    () -> {
                        throw new RuntimeException(new TestValidationException("invalid"));
                    };
            assertThatThrownBy(() -> service.runJobGeneric(false, work))
                    .isInstanceOf(RuntimeException.class)
                    .hasCauseInstanceOf(ExceptionUtils.BaseValidationException.class);
        }

        @Test
        @DisplayName("a cause of BaseAppException is rethrown")
        void appCauseRethrown() {
            Supplier<Object> work =
                    () -> {
                        throw new RuntimeException(new TestAppException("app error"));
                    };
            assertThatThrownBy(() -> service.runJobGeneric(false, work))
                    .isInstanceOf(RuntimeException.class)
                    .hasCauseInstanceOf(ExceptionUtils.BaseAppException.class);
        }
    }

    @Nested
    @DisplayName("synchronous result handling")
    class SyncResults {

        @Test
        @DisplayName("byte[] result becomes a PDF attachment response")
        void byteArrayBecomesAttachment() {
            byte[] payload = "pdf-bytes".getBytes(StandardCharsets.UTF_8);
            ResponseEntity<?> response = service.runJobGeneric(false, () -> payload);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isEqualTo(payload);
            assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PDF);
            assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
                    .contains("result.pdf");
        }

        @Test
        @DisplayName("MultipartFile result is streamed back with its own content type")
        void multipartBecomesResponse() {
            MultipartFile file =
                    new MockMultipartFile(
                            "f", "orig.txt", MediaType.TEXT_PLAIN_VALUE, "hi".getBytes());
            ResponseEntity<?> response = service.runJobGeneric(false, () -> file);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.TEXT_PLAIN);
            assertThat(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
                    .contains("orig.txt");
        }

        @Test
        @DisplayName("a ResponseEntity result is returned verbatim")
        void responseEntityReturnedVerbatim() {
            ResponseEntity<String> inner = ResponseEntity.status(HttpStatus.ACCEPTED).body("ok");
            ResponseEntity<?> response = service.runJobGeneric(false, () -> inner);
            assertThat(response).isSameAs(inner);
        }
    }

    @Nested
    @DisplayName("asynchronous error handling")
    class AsyncErrors {

        @Test
        @DisplayName("a thrown exception is recorded via TaskManager.setError")
        void asyncErrorRecorded() {
            Supplier<Object> work =
                    () -> {
                        throw new RuntimeException("async boom");
                    };
            ResponseEntity<?> response = service.runJobGeneric(true, work);
            assertThat(response.getBody()).isInstanceOf(JobResponse.class);
            verify(taskManager, timeout(5000)).setError(anyString(), eq("async boom"));
        }

        @Test
        @DisplayName("a job that exceeds its timeout is recorded as timed out")
        void asyncTimeoutRecorded() {
            Supplier<Object> work =
                    () -> {
                        long start = System.nanoTime();
                        while (System.nanoTime() - start < 200_000_000L) {
                            // busy wait beyond the 1ms timeout
                        }
                        return "late";
                    };
            // 1ms custom timeout, async, non-queueable.
            ResponseEntity<?> response = service.runJobGeneric(true, work, 1L, false, 10);
            assertThat(response.getBody()).isInstanceOf(JobResponse.class);
            verify(taskManager, timeout(5000)).setError(anyString(), eq("Job timed out"));
        }
    }

    @Nested
    @DisplayName("processJobResult branches (via async execution)")
    class ProcessJobResult {

        @Test
        @DisplayName("raw byte[] result is stored and recorded as a file")
        void rawBytesStored() throws Exception {
            byte[] payload = "raw".getBytes(StandardCharsets.UTF_8);
            when(fileStorage.storeBytes(any(byte[].class), eq("result.pdf")))
                    .thenReturn("bytes-id");

            service.runJobGeneric(true, () -> payload);

            verify(fileStorage, timeout(5000)).storeBytes(any(byte[].class), eq("result.pdf"));
            verify(taskManager, timeout(5000))
                    .setFileResult(
                            anyString(),
                            eq("bytes-id"),
                            eq("result.pdf"),
                            eq(MediaType.APPLICATION_PDF_VALUE));
            verify(taskManager, timeout(5000)).setComplete(anyString());
        }

        @Test
        @DisplayName("ResponseEntity<byte[]> is stored with the filename from headers")
        void responseEntityBytesStored() throws Exception {
            byte[] payload = "rebytes".getBytes(StandardCharsets.UTF_8);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDisposition(
                    ContentDisposition.formData().name("a").filename("out.pdf").build());
            Supplier<Object> work = () -> new ResponseEntity<>(payload, headers, HttpStatus.OK);
            when(fileStorage.storeBytes(any(byte[].class), eq("out.pdf"))).thenReturn("re-id");

            service.runJobGeneric(true, work);

            verify(taskManager, timeout(5000))
                    .setFileResult(
                            anyString(),
                            eq("re-id"),
                            eq("out.pdf"),
                            eq(MediaType.APPLICATION_PDF_VALUE));
        }

        @Test
        @DisplayName("ResponseEntity<StreamingResponseBody> is stored via storeFromStreamingBody")
        void responseEntityStreamingStored() throws Exception {
            StreamingResponseBody body = out -> out.write("stream".getBytes());
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
            Supplier<Object> work = () -> new ResponseEntity<>(body, headers, HttpStatus.OK);
            when(fileStorage.storeFromStreamingBody(any(StreamingResponseBody.class), anyString()))
                    .thenReturn("stream-id");

            service.runJobGeneric(true, work);

            verify(fileStorage, timeout(5000))
                    .storeFromStreamingBody(any(StreamingResponseBody.class), eq("result.pdf"));
            verify(taskManager, timeout(5000))
                    .setFileResult(anyString(), eq("stream-id"), eq("result.pdf"), anyString());
        }

        @Test
        @DisplayName("ResponseEntity body exposing getFileId is recorded via reflection")
        void responseEntityFileIdBean() {
            FileIdBean bean = new FileIdBean("bean-file", "bean.pdf", "text/custom");
            Supplier<Object> work = () -> ResponseEntity.ok(bean);

            service.runJobGeneric(true, work);

            verify(taskManager, timeout(5000))
                    .setFileResult(anyString(), eq("bean-file"), eq("bean.pdf"), eq("text/custom"));
            verify(taskManager, timeout(5000)).setComplete(anyString());
        }

        @Test
        @DisplayName("plain ResponseEntity body without fileId is stored as a generic result")
        void responseEntityPlainBody() {
            Supplier<Object> work = () -> ResponseEntity.ok("plain-string");

            service.runJobGeneric(true, work);

            verify(taskManager, timeout(5000)).setResult(anyString(), eq("plain-string"));
            verify(taskManager, timeout(5000)).setComplete(anyString());
        }

        @Test
        @DisplayName("MultipartFile result is stored via storeFile")
        void multipartStored() throws Exception {
            MultipartFile file =
                    new MockMultipartFile(
                            "f", "m.pdf", MediaType.APPLICATION_PDF_VALUE, "m".getBytes());
            when(fileStorage.storeFile(any(MultipartFile.class))).thenReturn("mp-id");

            service.runJobGeneric(true, () -> file);

            verify(taskManager, timeout(5000))
                    .setFileResult(
                            anyString(),
                            eq("mp-id"),
                            eq("m.pdf"),
                            eq(MediaType.APPLICATION_PDF_VALUE));
        }

        @Test
        @DisplayName("plain object result exposing getFileId is recorded via reflection")
        void plainObjectFileIdBean() {
            FileIdBean bean = new FileIdBean("plain-bean", "p.pdf", "app/p");

            service.runJobGeneric(true, () -> bean);

            verify(taskManager, timeout(5000))
                    .setFileResult(anyString(), eq("plain-bean"), eq("p.pdf"), eq("app/p"));
        }

        @Test
        @DisplayName("a generic non-file object is stored via setResult")
        void genericObjectStored() {
            service.runJobGeneric(true, () -> "just-text");
            verify(taskManager, timeout(5000)).setResult(anyString(), eq("just-text"));
        }

        @Test
        @DisplayName("a storage failure is recorded as an error on the task")
        void storageFailureRecordsError() throws Exception {
            byte[] payload = "x".getBytes(StandardCharsets.UTF_8);
            when(fileStorage.storeBytes(any(byte[].class), anyString()))
                    .thenThrow(new java.io.IOException("disk full"));

            service.runJobGeneric(true, () -> payload);

            verify(taskManager, timeout(5000))
                    .setError(anyString(), org.mockito.ArgumentMatchers.contains("disk full"));
        }
    }

    @Nested
    @DisplayName("queued execution")
    class QueuedExecution {

        @Test
        @DisplayName("queued wrapped work stores its result through processJobResult on success")
        void queuedWorkSuccess() {
            when(resourceMonitor.shouldQueueJob(80)).thenReturn(true);
            // Capture the wrapped supplier so we can run it as the queue would.
            ArgumentCaptor<Supplier<Object>> workCaptor = ArgumentCaptor.forClass(Supplier.class);
            when(jobQueue.queueJob(anyString(), eq(80), workCaptor.capture(), anyLong()))
                    .thenReturn(new CompletableFuture<>());

            ResponseEntity<?> response =
                    service.runJobGeneric(true, () -> "queued-ok", 5000, true, 80);
            assertThat(response.getBody()).isInstanceOf(JobResponse.class);

            // Execute the wrapped work and assert it routed the result to TaskManager.
            Object result = workCaptor.getValue().get();
            assertThat(result).isEqualTo("queued-ok");
            verify(taskManager).setResult(anyString(), eq("queued-ok"));
            verify(taskManager).setComplete(anyString());
        }

        @Test
        @DisplayName("queued wrapped work records and rethrows on failure")
        void queuedWorkFailure() {
            when(resourceMonitor.shouldQueueJob(80)).thenReturn(true);
            ArgumentCaptor<Supplier<Object>> workCaptor = ArgumentCaptor.forClass(Supplier.class);
            when(jobQueue.queueJob(anyString(), eq(80), workCaptor.capture(), anyLong()))
                    .thenReturn(new CompletableFuture<>());

            Supplier<Object> failing =
                    () -> {
                        throw new RuntimeException("queued-boom");
                    };
            service.runJobGeneric(true, failing, 5000, true, 80);

            assertThatThrownBy(() -> workCaptor.getValue().get())
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("queued-boom");
            verify(taskManager).setError(anyString(), eq("queued-boom"));
        }

        @Test
        @DisplayName("a job is not queued when it is synchronous even if queueable")
        void syncJobNeverQueued() {
            // queueable=true but async=false -> shouldQueue is false, runs inline.
            ResponseEntity<?> response = service.runJobGeneric(false, () -> "inline", 0, true, 90);
            assertThat(response.getBody()).isEqualTo("inline");
            verify(jobQueue, org.mockito.Mockito.never())
                    .queueJob(anyString(), anyInt(), any(), anyLong());
        }
    }

    @Nested
    @DisplayName("job ownership scoping")
    class JobOwnership {

        @Test
        @DisplayName("scoped job key and owner come from JobOwnershipService when present")
        void scopedKeyUsed() {
            JobOwnershipService ownership = org.mockito.Mockito.mock(JobOwnershipService.class);
            when(ownership.createScopedJobKey(anyString())).thenReturn("user1:scoped");
            lenient().when(ownership.getCurrentUserId()).thenReturn(Optional.of("user1"));
            ReflectionTestUtils.setField(service, "jobOwnershipService", ownership);

            ResponseEntity<?> response = service.runJobGeneric(true, () -> "owned");
            JobResponse<?> jobResponse = (JobResponse<?>) response.getBody();
            assertThat(jobResponse.getJobId()).isEqualTo("user1:scoped");
            verify(taskManager).createTask("user1:scoped");
        }
    }

    @Nested
    @DisplayName("session timeout parsing")
    class SessionTimeoutParsing {

        private long parse(String value) {
            JobExecutorService s =
                    new JobExecutorService(
                            taskManager,
                            fileStorage,
                            null,
                            resourceMonitor,
                            jobQueue,
                            999_999_999L,
                            value);
            return (long) ReflectionTestUtils.getField(s, "effectiveTimeoutMs");
        }

        @Test
        @DisplayName("seconds, hours and days units are parsed")
        void parsesUnits() {
            assertThat(parse("45s")).isEqualTo(45_000L);
            assertThat(parse("2h")).isEqualTo(2L * 60 * 60 * 1000);
            assertThat(parse("1d")).isEqualTo(24L * 60 * 60 * 1000);
        }

        @Test
        @DisplayName("an unrecognised unit defaults to minutes")
        void unknownUnitDefaultsToMinutes() {
            assertThat(parse("5x")).isEqualTo(5L * 60 * 1000);
        }

        @Test
        @DisplayName("null/empty and unparseable values fall back to 30 minutes")
        void fallbackToThirtyMinutes() {
            long thirtyMin = 30L * 60 * 1000;
            assertThat(parse("")).isEqualTo(thirtyMin);
            assertThat(parse("garbage")).isEqualTo(thirtyMin);
        }
    }

    @Nested
    @DisplayName("sync timeout")
    class SyncTimeout {

        @Test
        @DisplayName("a synchronous job that exceeds its timeout returns a 500 with a timeout body")
        void syncTimeoutReturns500() {
            Supplier<Object> work =
                    () -> {
                        long start = System.nanoTime();
                        while (System.nanoTime() - start < 200_000_000L) {
                            // busy wait beyond 1ms timeout
                        }
                        return "late";
                    };
            ResponseEntity<?> response = service.runJobGeneric(false, work, 1L);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            @SuppressWarnings("unchecked")
            Map<String, String> body = (Map<String, String>) response.getBody();
            assertThat(body.get("error")).contains("timed out");
        }
    }
}
