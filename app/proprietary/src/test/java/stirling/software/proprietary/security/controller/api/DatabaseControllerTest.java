package stirling.software.proprietary.security.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.FileInfo;
import stirling.software.proprietary.security.service.DatabaseService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DatabaseControllerTest {

    @Mock private DatabaseService databaseService;

    @InjectMocks private DatabaseController databaseController;

    /** Tracks temp files created during a test so they can be cleaned up afterwards. */
    private Path tempBackupFile;

    @AfterEach
    void cleanUp() throws IOException {
        if (tempBackupFile != null) {
            Files.deleteIfExists(tempBackupFile);
            tempBackupFile = null;
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> bodyAsMap(ResponseEntity<?> response) {
        assertInstanceOf(Map.class, response.getBody());
        return (Map<String, Object>) response.getBody();
    }

    private static FileInfo backup(String fileName) {
        return new FileInfo(
                fileName, "/backups/" + fileName, LocalDateTime.now(), 123L, LocalDateTime.now());
    }

    @Nested
    @DisplayName("importDatabase (multipart upload)")
    class ImportDatabase {

        @Test
        @DisplayName("returns 400 when the uploaded file is null")
        void nullFileReturnsBadRequest() throws IOException {
            ResponseEntity<?> response = databaseController.importDatabase(null);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("fileNullOrEmpty", bodyAsMap(response).get("error"));
            verify(databaseService, never()).importDatabaseFromUI(any(Path.class));
        }

        @Test
        @DisplayName("returns 400 when the uploaded file is empty")
        void emptyFileReturnsBadRequest() throws IOException {
            MultipartFile file = mock(MultipartFile.class);
            when(file.isEmpty()).thenReturn(true);

            ResponseEntity<?> response = databaseController.importDatabase(file);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("fileNullOrEmpty", bodyAsMap(response).get("error"));
            assertEquals("File is null or empty", bodyAsMap(response).get("message"));
            verify(databaseService, never()).importDatabaseFromUI(any(Path.class));
        }

        @Test
        @DisplayName("returns 200 and success payload when the import succeeds")
        void successfulImportReturnsOk() throws IOException {
            MultipartFile file = mock(MultipartFile.class);
            when(file.isEmpty()).thenReturn(false);
            when(file.getOriginalFilename()).thenReturn("backup_data.sql");
            when(file.getInputStream())
                    .thenReturn(
                            new ByteArrayInputStream(
                                    "CREATE TABLE t;".getBytes(StandardCharsets.UTF_8)));
            when(databaseService.importDatabaseFromUI(any(Path.class))).thenReturn(true);

            ResponseEntity<?> response = databaseController.importDatabase(file);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("importIntoDatabaseSuccessed", bodyAsMap(response).get("message"));
            assertEquals("Database imported successfully", bodyAsMap(response).get("description"));
            verify(databaseService).importDatabaseFromUI(any(Path.class));
        }

        @Test
        @DisplayName("returns 500 when the import service reports failure")
        void failedImportReturnsServerError() throws IOException {
            MultipartFile file = mock(MultipartFile.class);
            when(file.isEmpty()).thenReturn(false);
            when(file.getOriginalFilename()).thenReturn("backup_data.sql");
            when(file.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[] {1, 2, 3}));
            when(databaseService.importDatabaseFromUI(any(Path.class))).thenReturn(false);

            ResponseEntity<?> response = databaseController.importDatabase(file);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("failedImportFile", bodyAsMap(response).get("error"));
            assertEquals("Failed to import database file", bodyAsMap(response).get("message"));
        }

        @Test
        @DisplayName("returns 500 when reading the upload stream throws")
        void inputStreamFailureReturnsServerError() throws IOException {
            MultipartFile file = mock(MultipartFile.class);
            when(file.isEmpty()).thenReturn(false);
            when(file.getOriginalFilename()).thenReturn("backup_data.sql");
            when(file.getInputStream()).thenThrow(new IOException("stream boom"));

            ResponseEntity<?> response = databaseController.importDatabase(file);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("failedImportFile", bodyAsMap(response).get("error"));
            assertTrue(
                    ((String) bodyAsMap(response).get("message")).contains("stream boom"),
                    "message should include the underlying exception text");
            verify(databaseService, never()).importDatabaseFromUI(any(Path.class));
        }

        @Test
        @DisplayName("returns 500 when the import service throws an exception")
        void serviceExceptionReturnsServerError() throws IOException {
            MultipartFile file = mock(MultipartFile.class);
            when(file.isEmpty()).thenReturn(false);
            when(file.getOriginalFilename()).thenReturn("backup_data.sql");
            when(file.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[] {1, 2, 3}));
            when(databaseService.importDatabaseFromUI(any(Path.class)))
                    .thenThrow(new RuntimeException("import boom"));

            ResponseEntity<?> response = databaseController.importDatabase(file);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("failedImportFile", bodyAsMap(response).get("error"));
            assertTrue(((String) bodyAsMap(response).get("message")).contains("import boom"));
        }
    }

    @Nested
    @DisplayName("importDatabaseFromBackupUI (by file name)")
    class ImportDatabaseFromBackupUI {

        @Test
        @DisplayName("returns 400 when the file name is null")
        void nullFileNameReturnsBadRequest() {
            ResponseEntity<?> response = databaseController.importDatabaseFromBackupUI(null);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("fileNullOrEmpty", bodyAsMap(response).get("error"));
            verify(databaseService, never()).importDatabaseFromUI(anyString());
        }

        @Test
        @DisplayName("returns 400 when the file name is empty")
        void emptyFileNameReturnsBadRequest() {
            ResponseEntity<?> response = databaseController.importDatabaseFromBackupUI("");

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("fileNullOrEmpty", bodyAsMap(response).get("error"));
            verify(databaseService, never()).importDatabaseFromUI(anyString());
        }

        @Test
        @DisplayName("returns 404 when the file is not in the backup list")
        void missingFileReturnsNotFound() {
            when(databaseService.getBackupList()).thenReturn(List.of(backup("backup_2020.sql")));

            ResponseEntity<?> response =
                    databaseController.importDatabaseFromBackupUI("backup_other.sql");

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertEquals("fileNotFound", bodyAsMap(response).get("error"));
            verify(databaseService, never()).importDatabaseFromUI(anyString());
        }

        @Test
        @DisplayName("returns 200 when the file exists and imports successfully")
        void existingFileImportsSuccessfully() {
            String fileName = "backup_2024.sql";
            when(databaseService.getBackupList()).thenReturn(List.of(backup(fileName)));
            when(databaseService.importDatabaseFromUI(fileName)).thenReturn(true);

            ResponseEntity<?> response = databaseController.importDatabaseFromBackupUI(fileName);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("importIntoDatabaseSuccessed", bodyAsMap(response).get("message"));
            verify(databaseService).importDatabaseFromUI(fileName);
        }

        @Test
        @DisplayName("returns 500 when the file exists but the import fails")
        void existingFileImportFailureReturnsServerError() {
            String fileName = "backup_2024.sql";
            when(databaseService.getBackupList()).thenReturn(List.of(backup(fileName)));
            when(databaseService.importDatabaseFromUI(fileName)).thenReturn(false);

            ResponseEntity<?> response = databaseController.importDatabaseFromBackupUI(fileName);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("failedImportFile", bodyAsMap(response).get("error"));
        }
    }

    @Nested
    @DisplayName("deleteFile")
    class DeleteFile {

        @Test
        @DisplayName("returns 400 when the file name is null")
        void nullFileNameReturnsBadRequest() throws IOException {
            ResponseEntity<?> response = databaseController.deleteFile(null);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("invalidFileName", bodyAsMap(response).get("error"));
            verify(databaseService, never()).deleteBackupFile(anyString());
        }

        @Test
        @DisplayName("returns 400 when the file name is empty")
        void emptyFileNameReturnsBadRequest() throws IOException {
            ResponseEntity<?> response = databaseController.deleteFile("");

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("invalidFileName", bodyAsMap(response).get("error"));
            verify(databaseService, never()).deleteBackupFile(anyString());
        }

        @Test
        @DisplayName("returns 200 when the file is deleted")
        void successfulDeleteReturnsOk() throws IOException {
            when(databaseService.deleteBackupFile("backup_x.sql")).thenReturn(true);

            ResponseEntity<?> response = databaseController.deleteFile("backup_x.sql");

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("File deleted successfully", bodyAsMap(response).get("message"));
            verify(databaseService).deleteBackupFile("backup_x.sql");
        }

        @Test
        @DisplayName("returns 500 when the service reports the delete failed")
        void failedDeleteReturnsServerError() throws IOException {
            when(databaseService.deleteBackupFile("backup_x.sql")).thenReturn(false);

            ResponseEntity<?> response = databaseController.deleteFile("backup_x.sql");

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("failedToDeleteFile", bodyAsMap(response).get("error"));
        }

        @Test
        @DisplayName("returns 500 when the service throws IOException")
        void ioExceptionReturnsServerError() throws IOException {
            when(databaseService.deleteBackupFile("backup_x.sql"))
                    .thenThrow(new IOException("delete boom"));

            ResponseEntity<?> response = databaseController.deleteFile("backup_x.sql");

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("deleteError", bodyAsMap(response).get("error"));
            assertTrue(((String) bodyAsMap(response).get("message")).contains("delete boom"));
        }
    }

    @Nested
    @DisplayName("downloadFile")
    class DownloadFile {

        @Test
        @DisplayName("throws IllegalArgumentException when the file name is null")
        void nullFileNameThrows() {
            assertThrows(
                    IllegalArgumentException.class, () -> databaseController.downloadFile(null));
            verify(databaseService, never()).getBackupFilePath(anyString());
        }

        @Test
        @DisplayName("throws IllegalArgumentException when the file name is empty")
        void emptyFileNameThrows() {
            assertThrows(IllegalArgumentException.class, () -> databaseController.downloadFile(""));
        }

        @Test
        @DisplayName("returns 400 when the name does not match the backup pattern (prefix)")
        void rejectsNonBackupPrefix() {
            ResponseEntity<?> response = databaseController.downloadFile("notabackup.sql");

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("invalidFileName", bodyAsMap(response).get("error"));
            verify(databaseService, never()).getBackupFilePath(anyString());
        }

        @Test
        @DisplayName("returns 400 when the name lacks the .sql suffix")
        void rejectsNonSqlSuffix() {
            ResponseEntity<?> response = databaseController.downloadFile("backup_data.txt");

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
            assertEquals("invalidFileName", bodyAsMap(response).get("error"));
            verify(databaseService, never()).getBackupFilePath(anyString());
        }

        @Test
        @DisplayName("returns 200 with headers and resource for a valid backup file")
        void validBackupReturnsResource() throws IOException {
            String fileName = "backup_data.sql";
            tempBackupFile = Files.createTempFile("backup_dl_", ".sql");
            byte[] content = "CREATE TABLE t;".getBytes(StandardCharsets.UTF_8);
            Files.write(tempBackupFile, content);
            when(databaseService.getBackupFilePath(fileName)).thenReturn(tempBackupFile);

            ResponseEntity<?> response = databaseController.downloadFile(fileName);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(
                    "attachment;filename=" + fileName,
                    response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION));
            assertEquals(
                    MediaType.APPLICATION_OCTET_STREAM, response.getHeaders().getContentType());
            assertEquals(content.length, response.getHeaders().getContentLength());
            assertInstanceOf(InputStreamResource.class, response.getBody());
            // drain the stream so the file handle is released before @AfterEach deletes it
            try (InputStream in = ((InputStreamResource) response.getBody()).getInputStream()) {
                assertNotNull(in.readAllBytes());
            }
        }

        @Test
        @DisplayName("returns 500 when opening the backup file fails")
        void missingBackupFileReturnsServerError() {
            String fileName = "backup_missing.sql";
            Path nonExistent = Path.of("definitely-not-here", "backup_missing.sql");
            when(databaseService.getBackupFilePath(fileName)).thenReturn(nonExistent);

            ResponseEntity<?> response = databaseController.downloadFile(fileName);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals("downloadFailed", bodyAsMap(response).get("error"));
        }
    }

    @Nested
    @DisplayName("createDatabaseBackup")
    class CreateDatabaseBackup {

        @Test
        @DisplayName("returns 200 and triggers the export")
        void createBackupReturnsOk() {
            ResponseEntity<?> response = databaseController.createDatabaseBackup();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("backupCreated", bodyAsMap(response).get("message"));
            assertEquals(
                    "Database backup created successfully", bodyAsMap(response).get("description"));
            verify(databaseService).exportDatabase();
        }

        @Test
        @DisplayName("propagates a runtime exception from the export service")
        void exportExceptionPropagates() {
            org.mockito.Mockito.doThrow(new RuntimeException("export boom"))
                    .when(databaseService)
                    .exportDatabase();

            RuntimeException ex =
                    assertThrows(
                            RuntimeException.class,
                            () -> databaseController.createDatabaseBackup());
            assertEquals("export boom", ex.getMessage());
        }
    }

    @Test
    @DisplayName("importDatabaseFromBackupUI matches the exact requested file name")
    void importMatchesExactFileName() {
        String fileName = "backup_exact.sql";
        when(databaseService.getBackupList())
                .thenReturn(List.of(backup("backup_exact.sql"), backup("backup_exact.sql.bak")));
        when(databaseService.importDatabaseFromUI(eq(fileName))).thenReturn(true);

        ResponseEntity<?> response = databaseController.importDatabaseFromBackupUI(fileName);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(databaseService).importDatabaseFromUI(fileName);
    }

    /** Local helper mirroring Mockito.mock to keep static-import usage explicit and unambiguous. */
    private static <T> T mock(Class<T> clazz) {
        return org.mockito.Mockito.mock(clazz);
    }
}
