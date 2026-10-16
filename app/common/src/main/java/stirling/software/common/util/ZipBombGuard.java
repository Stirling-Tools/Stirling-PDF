package stirling.software.common.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import lombok.experimental.UtilityClass;

@UtilityClass
public class ZipBombGuard {

    public static final long MAX_ENTRY_BYTES = 100L * 1024 * 1024;
    public static final long MAX_TOTAL_BYTES = 500L * 1024 * 1024;
    public static final int MAX_ENTRIES = 10_000;

    private static final int BUFFER_SIZE = 8192;

    public static class ZipBombException extends IOException {
        public ZipBombException(String message) {
            super(message);
        }
    }

    public static byte[] readEntry(InputStream entryStream) throws IOException {
        return readEntry(entryStream, MAX_ENTRY_BYTES);
    }

    public static byte[] readEntry(InputStream entryStream, long maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[BUFFER_SIZE];
        long total = 0;
        int read;
        while ((read = entryStream.read(buffer)) != -1) {
            total += read;
            if (total > maxBytes) {
                throw new ZipBombException(
                        "Archive entry exceeds the maximum allowed size of " + maxBytes + " bytes");
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    public static class Budget {
        private final long maxEntryBytes;
        private final long maxTotalBytes;
        private final int maxEntries;
        private long totalBytes;
        private int entryCount;

        public Budget() {
            this(MAX_ENTRY_BYTES, MAX_TOTAL_BYTES, MAX_ENTRIES);
        }

        public Budget(long maxEntryBytes, long maxTotalBytes, int maxEntries) {
            this.maxEntryBytes = maxEntryBytes;
            this.maxTotalBytes = maxTotalBytes;
            this.maxEntries = maxEntries;
        }

        public byte[] readEntry(InputStream entryStream) throws IOException {
            countEntry();
            byte[] bytes = ZipBombGuard.readEntry(entryStream, maxEntryBytes);
            addToTotal(bytes.length);
            return bytes;
        }

        public void copyEntry(InputStream entryStream, Path target) throws IOException {
            countEntry();
            long written = 0;
            byte[] buffer = new byte[BUFFER_SIZE];
            try (OutputStream out = Files.newOutputStream(target)) {
                int read;
                while ((read = entryStream.read(buffer)) != -1) {
                    written += read;
                    if (written > maxEntryBytes) {
                        throw new ZipBombException(
                                "Archive entry exceeds the maximum allowed size of "
                                        + maxEntryBytes
                                        + " bytes");
                    }
                    out.write(buffer, 0, read);
                }
            }
            addToTotal(written);
        }

        private void countEntry() throws ZipBombException {
            if (++entryCount > maxEntries) {
                throw new ZipBombException(
                        "Archive contains more than the maximum allowed "
                                + maxEntries
                                + " entries");
            }
        }

        private void addToTotal(long bytes) throws ZipBombException {
            totalBytes += bytes;
            if (totalBytes > maxTotalBytes) {
                throw new ZipBombException(
                        "Archive decompresses to more than the maximum allowed "
                                + maxTotalBytes
                                + " bytes");
            }
        }
    }
}
