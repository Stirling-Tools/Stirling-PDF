package stirling.software.common.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import lombok.experimental.UtilityClass;

import stirling.software.common.model.ApplicationProperties;

@UtilityClass
public class ZipBombGuard {

    private static final int BUFFER_SIZE = 8192;

    /**
     * The limits an operator has configured under {@code system.archiveLimits}, or the built-in
     * defaults when no application context is available (tests, standalone utility use).
     */
    public static ApplicationProperties.System.ArchiveLimits configuredLimits() {
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        if (properties == null
                || properties.getSystem() == null
                || properties.getSystem().getArchiveLimits() == null) {
            return new ApplicationProperties.System.ArchiveLimits();
        }
        return properties.getSystem().getArchiveLimits();
    }

    public static class ZipBombException extends IOException {
        public ZipBombException(String message) {
            super(message);
        }
    }

    public static byte[] readEntry(InputStream entryStream) throws IOException {
        return readEntry(entryStream, configuredLimits().getMaxEntryBytes());
    }

    public static byte[] readEntry(InputStream entryStream, long maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[BUFFER_SIZE];
        long total = 0;
        int read;
        while ((read = entryStream.read(buffer)) != -1) {
            total += read;
            if (maxBytes > 0 && total > maxBytes) {
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
            this(configuredLimits());
        }

        public Budget(ApplicationProperties.System.ArchiveLimits limits) {
            this(limits.getMaxEntryBytes(), limits.getMaxTotalBytes(), limits.getMaxEntries());
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
                    if (maxEntryBytes > 0 && written > maxEntryBytes) {
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
            if (maxEntries > 0 && ++entryCount > maxEntries) {
                throw new ZipBombException(
                        "Archive contains more than the maximum allowed "
                                + maxEntries
                                + " entries");
            }
        }

        private void addToTotal(long bytes) throws ZipBombException {
            totalBytes += bytes;
            if (maxTotalBytes > 0 && totalBytes > maxTotalBytes) {
                throw new ZipBombException(
                        "Archive decompresses to more than the maximum allowed "
                                + maxTotalBytes
                                + " bytes");
            }
        }
    }
}
