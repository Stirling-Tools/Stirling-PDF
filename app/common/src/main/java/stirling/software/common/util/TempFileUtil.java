package stirling.software.common.util;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

import lombok.extern.slf4j.Slf4j;

/**
 * Utility class for handling temporary files with proper cleanup. Provides helper methods and
 * wrappers to ensure temp files are properly cleaned up.
 */
@Slf4j
public class TempFileUtil {

    /**
     * A collection of temporary files that implements AutoCloseable. All files in the collection
     * are cleaned up when close() is called.
     */
    public static class TempFileCollection implements AutoCloseable {
        private final TempFileManager manager;
        private final List<File> tempFiles = new ArrayList<>();

        public TempFileCollection(TempFileManager manager) {
            this.manager = manager;
        }

        public File addTempFile(String suffix) throws IOException {
            File file = manager.createTempFile(suffix);
            tempFiles.add(file);
            return file;
        }

        public List<File> getFiles() {
            return new ArrayList<>(tempFiles);
        }

        @Override
        public void close() {
            for (File file : tempFiles) {
                manager.deleteTempFile(file);
            }
        }
    }

    /**
     * Execute a function with a temporary file, ensuring cleanup in a finally block.
     *
     * @param <R> The return type of the function
     * @param tempFileManager The temp file manager
     * @param suffix File suffix (e.g., ".pdf")
     * @param function The function to execute with the temp file
     * @return The result of the function
     * @throws IOException If an I/O error occurs
     */
    public static <R> R withTempFile(
            TempFileManager tempFileManager, String suffix, Function<File, R> function)
            throws IOException {
        File tempFile = tempFileManager.createTempFile(suffix);
        try {
            return function.apply(tempFile);
        } finally {
            tempFileManager.deleteTempFile(tempFile);
        }
    }

    /**
     * Execute a function with multiple temporary files, ensuring cleanup in a finally block.
     *
     * @param <R> The return type of the function
     * @param tempFileManager The temp file manager
     * @param count Number of temp files to create
     * @param suffix File suffix (e.g., ".pdf")
     * @param function The function to execute with the temp files
     * @return The result of the function
     * @throws IOException If an I/O error occurs
     */
    public static <R> R withMultipleTempFiles(
            TempFileManager tempFileManager,
            int count,
            String suffix,
            Function<List<File>, R> function)
            throws IOException {
        List<File> tempFiles = new ArrayList<>(count);
        try {
            for (int i = 0; i < count; i++) {
                tempFiles.add(tempFileManager.createTempFile(suffix));
            }
            return function.apply(tempFiles);
        } finally {
            for (File file : tempFiles) {
                tempFileManager.deleteTempFile(file);
            }
        }
    }

    /**
     * Safely delete a list of temporary files, logging any errors.
     *
     * @param files The list of files to delete
     */
    public static void safeDeleteFiles(List<Path> files) {
        if (files == null) return;

        for (Path file : files) {
            if (file == null) continue;

            try {
                Files.deleteIfExists(file);
                log.debug("Deleted temp file: {}", file);
            } catch (IOException e) {
                log.warn("Failed to delete temp file: {}", file, e);
            }
        }
    }

    /**
     * Register an already created temp file with the registry. Use this for files created outside
     * of TempFileManager.
     *
     * @param tempFileManager The temp file manager
     * @param file The file to register
     * @return The registered file
     */
    public static File registerExistingTempFile(TempFileManager tempFileManager, File file) {
        if (tempFileManager != null && file != null && file.exists()) {
            return tempFileManager.register(file);
        }
        return file;
    }
}
