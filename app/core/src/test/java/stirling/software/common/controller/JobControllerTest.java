package stirling.software.common.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;

class JobControllerTest {

    private TaskManager taskManager;
    private FileStorage fileStorage;
    private JobQueue jobQueue;
    private HttpServletRequest request;
    private HttpSession session;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        taskManager = mock(TaskManager.class);
        fileStorage = mock(FileStorage.class);
        jobQueue = mock(JobQueue.class);
        request = mock(HttpServletRequest.class);
        session = mock(HttpSession.class);
        when(request.getSession()).thenReturn(session);

        JobController controller = new JobController(taskManager, fileStorage, jobQueue, request);
        mvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void getJobStatus_notFound_returns404() throws Exception {
        when(taskManager.getJobResult("abc")).thenReturn(null);
        mvc.perform(get("/api/v1/general/job/{jobId}", "abc")).andExpect(status().isNotFound());
    }

    @Test
    void getJobStatus_inQueue_addsQueueInfo() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(false);
        when(taskManager.getJobResult("j1")).thenReturn(result);
        when(jobQueue.isJobQueued("j1")).thenReturn(true);
        when(jobQueue.getJobPosition("j1")).thenReturn(3);

        mvc.perform(get("/api/v1/general/job/{jobId}", "j1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.queueInfo.inQueue").value(true))
                .andExpect(jsonPath("$.queueInfo.position").value(3));
    }

    @Test
    void getJobStatus_complete_returnsResult() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(true);
        when(taskManager.getJobResult("j2")).thenReturn(result);
        mvc.perform(get("/api/v1/general/job/{jobId}", "j2")).andExpect(status().isOk());
    }

    @Test
    void getJobStatus_inProgress_notQueued_returnsResult() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(false);
        when(taskManager.getJobResult("JSTAT")).thenReturn(result);
        when(jobQueue.isJobQueued("JSTAT")).thenReturn(false);

        mvc.perform(get("/api/v1/general/job/{jobId}", "JSTAT")).andExpect(status().isOk());
    }

    @Test
    void getJobResult_notFound() throws Exception {
        when(taskManager.getJobResult("x")).thenReturn(null);
        mvc.perform(get("/api/v1/general/job/{jobId}/result", "x"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getJobResult_notComplete_returns400() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(false);
        when(taskManager.getJobResult("j")).thenReturn(result);
        mvc.perform(get("/api/v1/general/job/{jobId}/result", "j"))
                .andExpect(status().isBadRequest())
                .andExpect(
                        content()
                                .string(
                                        org.hamcrest.Matchers.containsString(
                                                "Job is not complete yet")));
    }

    @Test
    void getJobResult_error_returns400() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(true);
        when(result.getError()).thenReturn("oops");
        when(taskManager.getJobResult("j")).thenReturn(result);
        mvc.perform(get("/api/v1/general/job/{jobId}/result", "j"))
                .andExpect(status().isBadRequest())
                .andExpect(
                        content().string(org.hamcrest.Matchers.containsString("Job failed: oops")));
    }

    @Test
    void getJobResult_multipleFiles_returnsJsonList() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(true);
        when(result.getError()).thenReturn(null);
        when(result.hasMultipleFiles()).thenReturn(true);

        ResultFile f1 = mock(ResultFile.class);
        ResultFile f2 = mock(ResultFile.class);
        when(result.getAllResultFiles()).thenReturn(List.of(f1, f2));
        when(taskManager.getJobResult("j")).thenReturn(result);

        mvc.perform(get("/api/v1/general/job/{jobId}/result", "j"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.jobId").value("j"))
                .andExpect(jsonPath("$.hasMultipleFiles").value(true))
                .andExpect(jsonPath("$.files.length()").value(2));
    }

    @Test
    void getJobResult_singleFile_streamsBytes_withHeaders() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(true);
        when(result.getError()).thenReturn(null);
        when(result.hasMultipleFiles()).thenReturn(false);
        when(result.hasFiles()).thenReturn(true);

        ResultFile rf = mock(ResultFile.class);
        when(rf.getFileId()).thenReturn("fid");
        when(rf.getFileName()).thenReturn("report.pdf");
        when(rf.getContentType()).thenReturn("application/pdf");
        when(result.getAllResultFiles()).thenReturn(List.of(rf));

        when(taskManager.getJobResult("job9")).thenReturn(result);
        when(fileStorage.retrieveBytes("fid"))
                .thenReturn("PDFDATA".getBytes(StandardCharsets.UTF_8));

        mvc.perform(get("/api/v1/general/job/{jobId}/result", "job9"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/pdf"))
                .andExpect(
                        header().string(
                                        "Content-Disposition",
                                        org.hamcrest.Matchers.containsString(
                                                "filename=\"report.pdf\"")))
                .andExpect(
                        header().string(
                                        "Content-Disposition",
                                        org.hamcrest.Matchers.containsString("filename*=")))
                .andExpect(content().bytes("PDFDATA".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void getJobResult_singleFile_retrievalError_returns500() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(true);
        when(result.getError()).thenReturn(null);
        when(result.hasMultipleFiles()).thenReturn(false);
        when(result.hasFiles()).thenReturn(true);

        ResultFile rf = mock(ResultFile.class);
        when(rf.getFileId()).thenReturn("fid");
        when(rf.getFileName()).thenReturn("x.pdf");
        when(rf.getContentType()).thenReturn("application/pdf");
        when(result.getAllResultFiles()).thenReturn(List.of(rf));

        when(taskManager.getJobResult("job10")).thenReturn(result);
        when(fileStorage.retrieveBytes("fid")).thenThrow(new RuntimeException("IO boom"));

        mvc.perform(get("/api/v1/general/job/{jobId}/result", "job10"))
                .andExpect(status().isInternalServerError())
                .andExpect(
                        content()
                                .string(
                                        org.hamcrest.Matchers.containsString(
                                                "Error retrieving file:")));
    }

    @Test
    void getJobResult_noFiles_returns_result_payload() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(true);
        when(result.getError()).thenReturn(null);
        when(result.hasMultipleFiles()).thenReturn(false);
        when(result.hasFiles()).thenReturn(false); // -> triggert den Fallback
        when(result.getResult()).thenReturn("SIMPLE-RESULT");

        when(taskManager.getJobResult("job11")).thenReturn(result);

        mvc.perform(get("/api/v1/general/job/{jobId}/result", "job11"))
                .andExpect(status().isOk())
                .andExpect(content().string("SIMPLE-RESULT"));
    }

    @Test
    void cancelJob_unauthorized_returns403() throws Exception {
        when(session.getAttribute("userJobIds")).thenReturn(null);

        mvc.perform(delete("/api/v1/general/job/{jobId}", "J1"))
                .andExpect(status().isForbidden())
                .andExpect(
                        jsonPath("$.message").value("You are not authorized to cancel this job"));
    }

    @Test
    void cancelJob_inQueue_success() throws Exception {
        when(session.getAttribute("userJobIds")).thenReturn(Set.of("J2"));
        when(jobQueue.isJobQueued("J2")).thenReturn(true);
        when(jobQueue.getJobPosition("J2")).thenReturn(5);
        when(jobQueue.cancelJob("J2")).thenReturn(true);

        mvc.perform(delete("/api/v1/general/job/{jobId}", "J2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Job cancelled successfully"))
                .andExpect(jsonPath("$.wasQueued").value(true))
                .andExpect(jsonPath("$.queuePosition").value(5));
    }

    @Test
    void cancelJob_taskManager_cancel_success_when_not_queued() throws Exception {
        when(session.getAttribute("userJobIds")).thenReturn(Set.of("J3"));
        when(jobQueue.isJobQueued("J3")).thenReturn(false);

        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(false);
        when(taskManager.getJobResult("J3")).thenReturn(result);

        mvc.perform(delete("/api/v1/general/job/{jobId}", "J3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Job cancelled successfully"))
                .andExpect(jsonPath("$.wasQueued").value(false))
                .andExpect(jsonPath("$.queuePosition").value("n/a"));

        verify(taskManager).setError(eq("J3"), any(String.class));
    }

    @Test
    void cancelJob_notFound_returns404() throws Exception {
        when(session.getAttribute("userJobIds")).thenReturn(Set.of("J4"));
        when(jobQueue.isJobQueued("J4")).thenReturn(false);
        when(taskManager.getJobResult("J4")).thenReturn(null);

        mvc.perform(delete("/api/v1/general/job/{jobId}", "J4")).andExpect(status().isNotFound());
    }

    @Test
    void cancelJob_alreadyComplete_returns400() throws Exception {
        when(session.getAttribute("userJobIds")).thenReturn(Set.of("J5"));
        when(jobQueue.isJobQueued("J5")).thenReturn(false);

        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(true);
        when(taskManager.getJobResult("J5")).thenReturn(result);

        mvc.perform(delete("/api/v1/general/job/{jobId}", "J5"))
                .andExpect(status().isBadRequest())
                .andExpect(
                        jsonPath("$.message").value("Cannot cancel job that is already complete"));
    }

    @Test
    void cancelJob_unknown_failure_returns500() throws Exception {
        // User besitzt den Job
        when(session.getAttribute("userJobIds")).thenReturn(java.util.Set.of("J6"));
        // Nicht in Queue
        when(jobQueue.isJobQueued("J6")).thenReturn(false);

        // 1. Aufruf im Mittelteil: completed -> kein setError -> cancelled bleibt false
        JobResult completed = mock(JobResult.class);
        when(completed.isComplete()).thenReturn(true);

        // 2. Aufruf im finalen else: nicht complete -> 500 "unknown reason"
        JobResult notComplete = mock(JobResult.class);
        when(notComplete.isComplete()).thenReturn(false);

        when(taskManager.getJobResult("J6"))
                .thenReturn(completed) // erster Aufruf (inside if (!cancelled))
                .thenReturn(notComplete); // zweiter Aufruf (final else)

        mvc.perform(delete("/api/v1/general/job/{jobId}", "J6"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("Failed to cancel job for unknown reason"));
    }

    @Test
    void cancelJob_unauthorized_wrong_attribute_type_returns403() throws Exception {
        when(session.getAttribute("userJobIds")).thenReturn(java.util.List.of("JX")); // kein Set
        mvc.perform(delete("/api/v1/general/job/{jobId}", "JX"))
                .andExpect(status().isForbidden())
                .andExpect(
                        jsonPath("$.message").value("You are not authorized to cancel this job"));
    }

    @Test
    void cancelJob_inQueue_cancelFalse_then_taskManager_setsError_ok() throws Exception {
        when(session.getAttribute("userJobIds")).thenReturn(java.util.Set.of("JQ"));
        when(jobQueue.isJobQueued("JQ")).thenReturn(true);
        when(jobQueue.getJobPosition("JQ")).thenReturn(2);
        when(jobQueue.cancelJob("JQ")).thenReturn(false); // zwingt den zweiten Pfad

        JobResult notComplete = mock(JobResult.class);
        when(notComplete.isComplete()).thenReturn(false);
        when(taskManager.getJobResult("JQ")).thenReturn(notComplete);

        mvc.perform(delete("/api/v1/general/job/{jobId}", "JQ"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Job cancelled successfully"))
                .andExpect(jsonPath("$.wasQueued").value(true))
                .andExpect(jsonPath("$.queuePosition").value(2));

        verify(taskManager).setError(eq("JQ"), any(String.class));
    }

    @Test
    void getJobFiles_notFound() throws Exception {
        when(taskManager.getJobResult("JJ")).thenReturn(null);
        mvc.perform(get("/api/v1/general/job/{jobId}/result/files", "JJ"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getJobFiles_notComplete() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(false);
        when(taskManager.getJobResult("JJ")).thenReturn(result);

        mvc.perform(get("/api/v1/general/job/{jobId}/result/files", "JJ"))
                .andExpect(status().isBadRequest())
                .andExpect(
                        content()
                                .string(
                                        org.hamcrest.Matchers.containsString(
                                                "Job is not complete yet")));
    }

    @Test
    void getJobFiles_error() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(true);
        when(result.getError()).thenReturn("E");
        when(taskManager.getJobResult("JJ")).thenReturn(result);

        mvc.perform(get("/api/v1/general/job/{jobId}/result/files", "JJ"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Job failed: E")));
    }

    @Test
    void getJobFiles_success() throws Exception {
        JobResult result = mock(JobResult.class);
        when(result.isComplete()).thenReturn(true);
        when(result.getError()).thenReturn(null);
        ResultFile f1 = mock(ResultFile.class);
        ResultFile f2 = mock(ResultFile.class);
        when(result.getAllResultFiles()).thenReturn(List.of(f1, f2));
        when(taskManager.getJobResult("JJ")).thenReturn(result);

        mvc.perform(get("/api/v1/general/job/{jobId}/result/files", "JJ"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value("JJ"))
                .andExpect(jsonPath("$.fileCount").value(2))
                .andExpect(jsonPath("$.files.length()").value(2));
    }

    @Test
    void getFileMetadata_notFound_when_file_missing() throws Exception {
        when(fileStorage.fileExists("F1")).thenReturn(false);
        mvc.perform(get("/api/v1/general/files/{fileId}/metadata", "F1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getFileMetadata_found_with_metadata() throws Exception {
        when(fileStorage.fileExists("F2")).thenReturn(true);
        ResultFile rf = mock(ResultFile.class);
        when(rf.getFileId()).thenReturn("F2");
        when(rf.getFileName()).thenReturn("name.pdf");
        when(rf.getContentType()).thenReturn("application/pdf");
        when(taskManager.findResultFileByFileId("F2")).thenReturn(rf);

        mvc.perform(get("/api/v1/general/files/{fileId}/metadata", "F2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fileId").value("F2"))
                .andExpect(jsonPath("$.fileName").value("name.pdf"))
                .andExpect(jsonPath("$.contentType").value("application/pdf"));
    }

    @Test
    void getFileMetadata_found_without_metadata_returns_basic_info() throws Exception {
        when(fileStorage.fileExists("F3")).thenReturn(true);
        when(taskManager.findResultFileByFileId("F3")).thenReturn(null);
        when(fileStorage.getFileSize("F3")).thenReturn(123L);

        mvc.perform(get("/api/v1/general/files/{fileId}/metadata", "F3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fileId").value("F3"))
                .andExpect(jsonPath("$.fileName").value("unknown"))
                .andExpect(jsonPath("$.contentType").value("application/octet-stream"))
                .andExpect(jsonPath("$.fileSize").value(123));
    }

    @Test
    void getFileMetadata_error_on_fileExists_returns500() throws Exception {
        when(fileStorage.fileExists("FERR2")).thenThrow(new RuntimeException("fail-exists"));

        mvc.perform(get("/api/v1/general/files/{fileId}/metadata", "FERR2"))
                .andExpect(status().isInternalServerError())
                .andExpect(
                        content()
                                .string(
                                        org.hamcrest.Matchers.containsString(
                                                "Error retrieving file metadata:")));
    }

    @Test
    void downloadFile_notFound() throws Exception {
        when(fileStorage.fileExists("FX")).thenReturn(false);
        mvc.perform(get("/api/v1/general/files/{fileId}", "FX")).andExpect(status().isNotFound());
    }

    @Test
    void downloadFile_success_with_metadata() throws Exception {
        when(fileStorage.fileExists("FY")).thenReturn(true);
        when(fileStorage.retrieveBytes("FY")).thenReturn("DATA".getBytes(StandardCharsets.UTF_8));
        ResultFile rf = mock(ResultFile.class);
        when(rf.getFileName()).thenReturn("out.txt");
        when(rf.getContentType()).thenReturn("text/plain");
        when(taskManager.findResultFileByFileId("FY")).thenReturn(rf);

        mvc.perform(get("/api/v1/general/files/{fileId}", "FY"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/plain"))
                .andExpect(
                        header().string(
                                        "Content-Disposition",
                                        org.hamcrest.Matchers.containsString("out.txt")))
                .andExpect(content().bytes("DATA".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void downloadFile_error_returns500() throws Exception {
        when(fileStorage.fileExists("FZ")).thenReturn(true);
        when(fileStorage.retrieveBytes("FZ")).thenThrow(new RuntimeException("oops"));

        mvc.perform(get("/api/v1/general/files/{fileId}", "FZ"))
                .andExpect(status().isInternalServerError())
                .andExpect(
                        content()
                                .string(
                                        org.hamcrest.Matchers.containsString(
                                                "Error retrieving file:")));
    }

    @Test
    void downloadFile_filename_encoding_fallback_on_exception() throws Exception {
        when(fileStorage.fileExists("FENC")).thenReturn(true);
        when(fileStorage.retrieveBytes("FENC"))
                .thenReturn("X".getBytes(java.nio.charset.StandardCharsets.UTF_8));

        // ResultFile mit NULL-Dateiname -> URLEncoder.encode(...) wirft NPE -> Catch-Fallback
        ResultFile rf = mock(ResultFile.class);
        when(rf.getFileName()).thenReturn(null);
        when(rf.getContentType()).thenReturn("text/plain");
        when(taskManager.findResultFileByFileId("FENC")).thenReturn(rf);

        mvc.perform(get("/api/v1/general/files/{fileId}", "FENC"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/plain"))
                // Fallback-Header: nur filename=..., kein filename*=
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"null\""))
                .andExpect(content().bytes("X".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    @Test
    void downloadFile_success_without_metadata_defaults() throws Exception {
        when(fileStorage.fileExists("FD")).thenReturn(true);
        when(fileStorage.retrieveBytes("FD"))
                .thenReturn("D".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        // keine Metadata
        when(taskManager.findResultFileByFileId("FD")).thenReturn(null);

        mvc.perform(get("/api/v1/general/files/{fileId}", "FD"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/octet-stream"))
                .andExpect(
                        header().string(
                                        "Content-Disposition",
                                        org.hamcrest.Matchers.allOf(
                                                org.hamcrest.Matchers.containsString(
                                                        "filename=\"download\""),
                                                org.hamcrest.Matchers.containsString(
                                                        "filename*="))))
                .andExpect(content().bytes("D".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
}
