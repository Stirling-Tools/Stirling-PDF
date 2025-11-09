package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

class TempFileUtilTest {

    @TempDir Path tempDir;

    @Test
    void withTempFileExecutesFunctionAndCleansUp() throws IOException {
        TempFileManager manager = mock(TempFileManager.class);
        File tempFile = Files.createTempFile(tempDir, "single", ".tmp").toFile();

        when(manager.createTempFile(".tmp")).thenReturn(tempFile);
        when(manager.deleteTempFile(tempFile)).thenReturn(true);

        String result =
                TempFileUtil.withTempFile(
                        manager,
                        ".tmp",
                        file -> {
                            assertEquals(tempFile, file);
                            assertTrue(file.exists());
                            return "completed";
                        });

        assertEquals("completed", result);
        verify(manager).createTempFile(".tmp");
        verify(manager).deleteTempFile(tempFile);
    }

    @Test
    void withMultipleTempFilesCreatesRequestedFilesAndCleansUp() throws IOException {
        TempFileManager manager = mock(TempFileManager.class);
        File first = Files.createTempFile(tempDir, "multi1", ".tmp").toFile();
        File second = Files.createTempFile(tempDir, "multi2", ".tmp").toFile();

        when(manager.createTempFile(".tmp")).thenReturn(first, second);
        when(manager.deleteTempFile(first)).thenReturn(true);
        when(manager.deleteTempFile(second)).thenReturn(true);

        List<String> names =
                TempFileUtil.withMultipleTempFiles(
                        manager,
                        2,
                        ".tmp",
                        files -> {
                            assertEquals(2, files.size());
                            assertTrue(files.containsAll(List.of(first, second)));
                            return files.stream().map(File::getName).collect(Collectors.toList());
                        });

        assertEquals(List.of(first.getName(), second.getName()), names);
        verify(manager, times(2)).createTempFile(".tmp");
        verify(manager).deleteTempFile(first);
        verify(manager).deleteTempFile(second);
    }

    @Test
    void tempFileCollectionAddsFilesAndCleansUp() throws IOException {
        TempFileManager manager = mock(TempFileManager.class);
        TempFileUtil.TempFileCollection collection = new TempFileUtil.TempFileCollection(manager);
        File first = Files.createTempFile(tempDir, "collection1", ".tmp").toFile();
        File second = Files.createTempFile(tempDir, "collection2", ".tmp").toFile();

        when(manager.createTempFile(".tmp")).thenReturn(first, second);
        when(manager.deleteTempFile(first)).thenReturn(true);
        when(manager.deleteTempFile(second)).thenReturn(true);

        assertEquals(first, collection.addTempFile(".tmp"));
        assertEquals(second, collection.addTempFile(".tmp"));

        List<File> snapshot = collection.getFiles();
        assertEquals(2, snapshot.size());
        assertTrue(snapshot.containsAll(List.of(first, second)));

        snapshot.clear();
        assertTrue(snapshot.isEmpty());
        assertEquals(
                2,
                collection.getFiles().size(),
                "Clearing snapshot should not affect internal state");

        collection.close();

        verify(manager).deleteTempFile(first);
        verify(manager).deleteTempFile(second);
    }

    @Test
    void safeDeleteFilesRemovesExistingFilesAndIgnoresNulls() throws IOException {
        Path existing = Files.createTempFile(tempDir, "existing", ".tmp");
        Path nonExistent = tempDir.resolve("missing.tmp");

        TempFileUtil.safeDeleteFiles(Arrays.asList(existing, null, nonExistent));

        assertFalse(Files.exists(existing));
        assertFalse(Files.exists(nonExistent));
        TempFileUtil.safeDeleteFiles(null); // ensure no exception
    }

    @Test
    void safeDeleteFilesContinuesWhenDeletionFails() throws IOException {
        Path failing = Path.of("/tmp/failing-file");
        Path succeeding = Path.of("/tmp/succeeding-file");

        try (MockedStatic<Files> filesMock = mockStatic(Files.class)) {
            filesMock.when(() -> Files.deleteIfExists(failing)).thenThrow(new IOException("boom"));
            filesMock.when(() -> Files.deleteIfExists(succeeding)).thenReturn(true);

            TempFileUtil.safeDeleteFiles(List.of(failing, succeeding));

            filesMock.verify(() -> Files.deleteIfExists(failing));
            filesMock.verify(() -> Files.deleteIfExists(succeeding));
        }
    }

    @Test
    void registerExistingTempFileRegistersWhenPossible() throws IOException {
        TempFileManager manager = mock(TempFileManager.class);
        File file = Files.createTempFile(tempDir, "register", ".tmp").toFile();

        when(manager.register(file)).thenReturn(file);

        File result = TempFileUtil.registerExistingTempFile(manager, file);

        assertSame(file, result);
        verify(manager).register(file);
    }

    @Test
    void registerExistingTempFileReturnsOriginalWhenInvalid() {
        TempFileManager manager = mock(TempFileManager.class);
        File missing = tempDir.resolve("missing.tmp").toFile();

        File result = TempFileUtil.registerExistingTempFile(manager, missing);

        assertSame(missing, result);
        verify(manager, never()).register(any());

        assertNull(TempFileUtil.registerExistingTempFile(manager, null));
        assertNull(TempFileUtil.registerExistingTempFile(null, null));
    }
}
