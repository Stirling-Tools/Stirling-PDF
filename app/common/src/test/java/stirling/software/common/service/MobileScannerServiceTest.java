package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class MobileScannerServiceTest {

    private MobileScannerService service;
    private final List<String> sessionIds = new ArrayList<>();

    @BeforeEach
    void setUp() throws IOException {
        service = new MobileScannerService();
    }

    @AfterEach
    void tearDown() {
        sessionIds.forEach(service::deleteSession);
    }

    @Test
    void concurrentBatchDownloadsDoNotDeleteSessionBeforeEveryReadCompletes() throws Exception {
        String sessionId = newSessionId("batch-concurrent");
        List<String> filenames =
                IntStream.rangeClosed(1, 5).mapToObj(index -> "scan-" + index + ".jpg").toList();
        Map<String, byte[]> expectedBytes = uploadFiles(sessionId, filenames);

        ExecutorService executor = Executors.newFixedThreadPool(filenames.size());
        CountDownLatch allPathsResolved = new CountDownLatch(filenames.size());
        CountDownLatch firstFileDeleted = new CountDownLatch(1);
        List<Future<byte[]>> downloads = new ArrayList<>();

        try {
            for (int index = 0; index < filenames.size(); index++) {
                String filename = filenames.get(index);
                boolean firstDownload = index == 0;
                downloads.add(
                        executor.submit(
                                () ->
                                        downloadWithCoordination(
                                                sessionId,
                                                filename,
                                                allPathsResolved,
                                                firstFileDeleted,
                                                firstDownload)));
            }

            for (int index = 0; index < downloads.size(); index++) {
                assertArrayEquals(
                        expectedBytes.get(filenames.get(index)),
                        downloads.get(index).get(5, TimeUnit.SECONDS));
            }
        } finally {
            executor.shutdownNow();
        }

        assertNull(service.validateSession(sessionId));
    }

    @Test
    void sequentialDownloadsKeepSessionUntilFinalFileIsDeleted() throws Exception {
        String sessionId = newSessionId("batch-sequential");
        List<String> filenames = List.of("scan-1.jpg", "scan-2.jpg", "scan-3.jpg");
        Map<String, byte[]> expectedBytes = uploadFiles(sessionId, filenames);

        Path firstPath = service.getFile(sessionId, filenames.get(0));
        Path secondPath = service.getFile(sessionId, filenames.get(1));
        Path thirdPath = service.getFile(sessionId, filenames.get(2));

        assertArrayEquals(expectedBytes.get(filenames.get(0)), Files.readAllBytes(firstPath));
        service.deleteFileAfterDownload(sessionId, filenames.get(0));

        assertTrue(Files.exists(secondPath));
        assertTrue(Files.exists(thirdPath));
        assertNotNull(service.validateSession(sessionId));

        assertArrayEquals(expectedBytes.get(filenames.get(1)), Files.readAllBytes(secondPath));
        service.deleteFileAfterDownload(sessionId, filenames.get(1));

        assertTrue(Files.exists(thirdPath));
        assertNotNull(service.validateSession(sessionId));

        assertArrayEquals(expectedBytes.get(filenames.get(2)), Files.readAllBytes(thirdPath));
        service.deleteFileAfterDownload(sessionId, filenames.get(2));

        assertNull(service.validateSession(sessionId));
    }

    @Test
    void concurrentGetFileCallsOnSameSessionDoNotLoseDownloadUpdates() throws Exception {
        String sessionId = newSessionId("batch-tracking");
        List<String> filenames =
                IntStream.rangeClosed(1, 16)
                        .mapToObj(index -> "scan-" + index + ".jpg")
                        .toList();
        Map<String, byte[]> expectedBytes = uploadFiles(sessionId, filenames);

        ExecutorService executor = Executors.newFixedThreadPool(filenames.size());
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Path>> resolvedPaths = new ArrayList<>();

        try {
            for (String filename : filenames) {
                resolvedPaths.add(
                        executor.submit(
                                () -> {
                                    await(start);
                                    return service.getFile(sessionId, filename);
                                }));
            }

            start.countDown();

            List<Path> paths = new ArrayList<>();
            for (Future<Path> resolvedPath : resolvedPaths) {
                Path path = resolvedPath.get(5, TimeUnit.SECONDS);
                assertTrue(Files.exists(path));
                paths.add(path);
            }

            assertArrayEquals(
                    expectedBytes.get(filenames.get(0)), Files.readAllBytes(paths.get(0)));
            service.deleteFileAfterDownload(sessionId, filenames.get(0));

            for (int index = 1; index < paths.size(); index++) {
                assertTrue(Files.exists(paths.get(index)));
                assertArrayEquals(
                        expectedBytes.get(filenames.get(index)),
                        Files.readAllBytes(paths.get(index)));
                service.deleteFileAfterDownload(sessionId, filenames.get(index));
            }
        } finally {
            executor.shutdownNow();
        }

        assertNull(service.validateSession(sessionId));
    }

    @Test
    void requestingFileAfterDeletedSessionDoesNotDeleteUnrelatedSessions() throws Exception {
        String deletedSessionId = newSessionId("deleted-session");
        String unrelatedSessionId = newSessionId("unrelated-session");
        String deletedFilename = "scan-deleted.jpg";
        String unrelatedFilename = "scan-unrelated.jpg";
        Map<String, byte[]> deletedBytes = uploadFiles(deletedSessionId, List.of(deletedFilename));
        Map<String, byte[]> unrelatedBytes =
                uploadFiles(unrelatedSessionId, List.of(unrelatedFilename));

        Path deletedPath = service.getFile(deletedSessionId, deletedFilename);
        assertArrayEquals(deletedBytes.get(deletedFilename), Files.readAllBytes(deletedPath));
        service.deleteFileAfterDownload(deletedSessionId, deletedFilename);

        IOException missingFile =
                assertThrows(
                        IOException.class,
                        () -> service.getFile(deletedSessionId, deletedFilename));
        assertTrue(
                missingFile.getMessage().contains("Session not found")
                        || missingFile.getMessage().contains("File not found"));

        assertNotNull(service.validateSession(unrelatedSessionId));
        Path unrelatedPath = service.getFile(unrelatedSessionId, unrelatedFilename);
        assertArrayEquals(
                unrelatedBytes.get(unrelatedFilename), Files.readAllBytes(unrelatedPath));
        service.deleteFileAfterDownload(unrelatedSessionId, unrelatedFilename);
    }

    private byte[] downloadWithCoordination(
            String sessionId,
            String filename,
            CountDownLatch allPathsResolved,
            CountDownLatch firstFileDeleted,
            boolean firstDownload)
            throws Exception {
        Path path = service.getFile(sessionId, filename);
        allPathsResolved.countDown();
        await(allPathsResolved);

        if (firstDownload) {
            byte[] fileBytes = Files.readAllBytes(path);
            service.deleteFileAfterDownload(sessionId, filename);
            firstFileDeleted.countDown();
            return fileBytes;
        }

        await(firstFileDeleted);
        byte[] fileBytes = Files.readAllBytes(path);
        service.deleteFileAfterDownload(sessionId, filename);
        return fileBytes;
    }

    private Map<String, byte[]> uploadFiles(String sessionId, List<String> filenames)
            throws IOException {
        Map<String, byte[]> expectedBytes = new HashMap<>();
        List<MultipartFile> files = new ArrayList<>();

        for (String filename : filenames) {
            byte[] fileBytes = ("content for " + filename).getBytes(StandardCharsets.UTF_8);
            expectedBytes.put(filename, fileBytes);
            files.add(
                    new MockMultipartFile(
                            "files", filename, MediaType.IMAGE_JPEG_VALUE, fileBytes));
        }

        service.createSession(sessionId);
        service.uploadFiles(sessionId, files);
        return expectedBytes;
    }

    private String newSessionId(String prefix) {
        String sessionId = prefix + "-" + UUID.randomUUID();
        sessionIds.add(sessionId);
        return sessionId;
    }

    private static void await(CountDownLatch latch) throws InterruptedException {
        assertTrue(latch.await(5, TimeUnit.SECONDS), "Timed out waiting for coordinated download");
    }
}
