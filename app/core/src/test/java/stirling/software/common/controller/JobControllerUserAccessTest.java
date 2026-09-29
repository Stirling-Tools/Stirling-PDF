package stirling.software.common.controller;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.SPDF.service.pdfjson.JobOwnershipServiceImpl;
import stirling.software.SPDF.service.pdfjson.NoOpJobOwnershipService;
import stirling.software.common.cluster.inprocess.InProcessClusterBackplane;
import stirling.software.common.cluster.inprocess.InProcessJobStore;
import stirling.software.common.cluster.inprocess.LocalDiskFileStore;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.FileOrUploadService;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.JobContext;

class JobControllerUserAccessTest {
    private static final byte[] OUTPUT =
            "%PDF-processed-document".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    @TempDir Path directory;
    private final UserServiceInterface users = mock(UserServiceInterface.class);
    private TaskManager tasks;
    private JobController controller;
    private String fileId;
    private String runId;

    private void storeOutput(boolean loginEnabled) throws Exception {
        JobOwnershipService ownership;
        if (loginEnabled) {
            ownership = new JobOwnershipServiceImpl();
            ReflectionTestUtils.setField(ownership, "userService", users);
        } else {
            ownership = new NoOpJobOwnershipService();
        }
        LocalDiskFileStore disk = new LocalDiskFileStore(directory.toString());
        FileStorage storage =
                new FileStorage(mock(FileOrUploadService.class), disk, Optional.of(ownership));
        tasks =
                new TaskManager(
                        storage,
                        new InProcessJobStore(),
                        new InProcessClusterBackplane(new ApplicationProperties()));
        controller =
                new JobController(
                        tasks,
                        storage,
                        mock(JobQueue.class),
                        mock(HttpServletRequest.class),
                        null,
                        null);
        ReflectionTestUtils.setField(controller, "jobOwnershipService", ownership);
        runId = ownership.createScopedJobKey("run", "source-owner");
        tasks.createTask(runId);
        JobContext.setOwner("source-owner");
        try {
            fileId =
                    storage.storeInputStream(new ByteArrayInputStream(OUTPUT), "result.pdf")
                            .fileId();
        } finally {
            JobContext.setOwner(null);
        }
        tasks.setMultipleFileResults(
                runId,
                List.of(
                        ResultFile.builder()
                                .fileId(fileId)
                                .fileName("result.pdf")
                                .contentType("application/pdf")
                                .fileSize((long) OUTPUT.length)
                                .build()));
        tasks.setComplete(runId);
        assertEquals("source-owner", disk.getOwner(fileId));
    }

    @AfterEach
    void tearDown() {
        if (tasks != null) {
            tasks.shutdown();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"pipeline-creator", "trigger-user", "teammate"})
    void onlyTheDocumentOwnerCanReadResults(String otherUser) throws Exception {
        storeOutput(true);
        when(users.getCurrentUsername()).thenReturn(otherUser);
        assertEquals(HttpStatus.FORBIDDEN, controller.downloadFile(fileId).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, controller.getFileMetadata(fileId).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN, controller.getJobStatus(runId).getStatusCode());

        when(users.getCurrentUsername()).thenReturn("source-owner");
        var response = controller.downloadFile(fileId);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertArrayEquals(OUTPUT, (byte[]) response.getBody());
        assertEquals(HttpStatus.OK, controller.getFileMetadata(fileId).getStatusCode());
        assertEquals(HttpStatus.OK, controller.getJobStatus(runId).getStatusCode());
    }

    @Test
    void loginDisabledKeepsOutputsAccessible() throws Exception {
        storeOutput(false);
        assertEquals("run", runId);
        var response = controller.downloadFile(fileId);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertArrayEquals(OUTPUT, (byte[]) response.getBody());
    }
}
