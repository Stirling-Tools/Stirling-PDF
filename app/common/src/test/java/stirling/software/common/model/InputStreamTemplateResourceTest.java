package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.io.*;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class InputStreamTemplateResourceTest {

    @Test
    @DisplayName("should create reader and read content correctly")
    void shouldCreateReaderAndReadContent() throws IOException {
        // Arrange
        String expectedContent = "Hello Thymeleaf!";
        InputStream is = new ByteArrayInputStream(expectedContent.getBytes(StandardCharsets.UTF_8));
        InputStreamTemplateResource resource =
                new InputStreamTemplateResource(is, StandardCharsets.UTF_8.name());

        // Act
        try (Reader reader = resource.reader()) {
            char[] buffer = new char[expectedContent.length()];
            int read = reader.read(buffer);
            String actualContent = new String(buffer, 0, read);

            // Assert
            assertEquals(
                    expectedContent,
                    actualContent,
                    "The content read should match the original string");
        }
    }

    @Test
    @DisplayName("should throw UnsupportedOperationException when calling relative()")
    void shouldThrowExceptionOnRelativeCall() {
        // Arrange
        InputStreamTemplateResource resource =
                new InputStreamTemplateResource(
                        new ByteArrayInputStream(new byte[0]), StandardCharsets.UTF_8.name());

        // Act & Assert
        UnsupportedOperationException ex =
                assertThrows(
                        UnsupportedOperationException.class, () -> resource.relative("test.html"));
        assertEquals("Relative resources not supported", ex.getMessage());
    }

    @Test
    @DisplayName("should return correct description")
    void shouldReturnCorrectDescription() {
        InputStreamTemplateResource resource =
                new InputStreamTemplateResource(
                        new ByteArrayInputStream(new byte[0]), StandardCharsets.UTF_8.name());

        assertEquals("InputStream resource [Stream]", resource.getDescription());
    }

    @Test
    @DisplayName("should return correct base name")
    void shouldReturnCorrectBaseName() {
        InputStreamTemplateResource resource =
                new InputStreamTemplateResource(
                        new ByteArrayInputStream(new byte[0]), StandardCharsets.UTF_8.name());

        assertEquals("streamResource", resource.getBaseName());
    }

    @Test
    @DisplayName("should return true for exists() when inputStream is not null")
    void shouldReturnTrueWhenInputStreamNotNull() {
        InputStreamTemplateResource resource =
                new InputStreamTemplateResource(
                        new ByteArrayInputStream(new byte[0]), StandardCharsets.UTF_8.name());

        assertTrue(resource.exists(), "exists() should return true when inputStream is not null");
    }

    @Test
    @DisplayName("should return false for exists() when inputStream is null")
    void shouldReturnFalseWhenInputStreamIsNull() {
        InputStreamTemplateResource resource =
                new InputStreamTemplateResource(null, StandardCharsets.UTF_8.name());

        assertFalse(resource.exists(), "exists() should return false when inputStream is null");
    }

    @Test
    @DisplayName("should propagate IOException from underlying stream when reading after close")
    void shouldPropagateIOExceptionFromUnderlyingStreamWhenReadingAfterClose() {
        // Changed: ByteArrayInputStream#close() is a no-op, so no IOException occurs on read.
        // We use a custom InputStream that throws IOException on read after close.
        class FailingInputStream extends InputStream {
            private boolean closed = false;

            @Override
            public int read() throws IOException {
                if (closed) throw new IOException("Stream closed");
                // Force failure to prove propagation even if not closed (not strictly needed)
                throw new IOException("Forced read failure");
            }

            @Override
            public int read(byte[] b, int off, int len) throws IOException {
                if (closed) throw new IOException("Stream closed");
                throw new IOException("Forced read failure");
            }

            @Override
            public void close() throws IOException {
                closed = true;
            }
        }

        InputStream failing = new FailingInputStream();
        InputStreamTemplateResource resource =
                new InputStreamTemplateResource(failing, StandardCharsets.UTF_8.name());

        // Close first to simulate "closed stream" scenario
        assertDoesNotThrow(() -> failing.close(), "Closing the stream should not throw");

        // Act & Assert: reading through the Reader should propagate the IOException
        IOException ex =
                assertThrows(
                        IOException.class,
                        () -> {
                            try (Reader reader = resource.reader()) {
                                reader.read(); // triggers the underlying stream read -> IOException
                            }
                        });

        assertTrue(
                ex.getMessage() != null && !ex.getMessage().isBlank(),
                "IOException should provide a non-empty message");
    }

    @Test
    @DisplayName("should correctly handle different character encodings")
    void shouldHandleDifferentCharacterEncodings() throws IOException {
        String expectedContent = "äöüß";
        byte[] bytes = expectedContent.getBytes(StandardCharsets.ISO_8859_1);
        InputStream is = new ByteArrayInputStream(bytes);
        InputStreamTemplateResource resource =
                new InputStreamTemplateResource(is, StandardCharsets.ISO_8859_1.name());

        try (Reader reader = resource.reader()) {
            char[] buffer = new char[expectedContent.length()];
            int read = reader.read(buffer);
            String actualContent = new String(buffer, 0, read);

            assertEquals(expectedContent, actualContent);
        }
    }
}
