package org.apache.pdfbox.examples.util;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.io.RandomAccessReadBufferedFile;

import lombok.extern.slf4j.Slf4j;

/** A custom RandomAccessRead implementation that deletes the file when closed */
@Slf4j
public class DeletingRandomAccessFile extends RandomAccessReadBufferedFile {
    private final Path tempFilePath;

    public DeletingRandomAccessFile(File file) throws IOException {
        super(file);
        this.tempFilePath = file.toPath();
    }

    @Override
    public void close() throws IOException {
        try {
            super.close();
        } finally {
            try {
                boolean deleted = Files.deleteIfExists(tempFilePath);
                if (deleted) {
                    log.info("Successfully deleted temp file: {}", tempFilePath);
                } else {
                    log.warn("Failed to delete temp file (may not exist): {}", tempFilePath);
                }
            } catch (IOException e) {
                log.error("Error deleting temp file: {}", tempFilePath, e);
            }
        }
    }
}
