package stirling.software.common.util.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.InputStreamResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.misc.ReplaceAndInvert;

@DisplayName("ReplaceAndInvertColorStrategy Tests")
class ReplaceAndInvertColorStrategyTest {

    // Concrete implementation of the abstract class for testing
    private static class ConcreteReplaceAndInvertColorStrategy extends ReplaceAndInvertColorStrategy {

        public ConcreteReplaceAndInvertColorStrategy(MultipartFile file, ReplaceAndInvert replaceAndInvert) {
            super(file, replaceAndInvert);
        }

        @Override
        public InputStreamResource replace() throws IOException {
            // Simple implementation for testing purposes
            return new InputStreamResource(getFileInput().getInputStream());
        }
    }

    @Nested
    @DisplayName("Constructor and Accessor Tests")
    class ConstructorAndAccessorTests {

        @Test
        @DisplayName("Constructor initializes fields correctly")
        void testConstructor() {
            // Arrange
            MultipartFile mockFile = new MockMultipartFile("file", "test.pdf", "application/pdf", "test content".getBytes());
            ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.CUSTOM_COLOR;

            // Act
            ReplaceAndInvertColorStrategy strategy = new ConcreteReplaceAndInvertColorStrategy(mockFile, replaceAndInvert);

            // Assert
            assertNotNull(strategy, "Strategy instance should not be null");
            assertEquals(mockFile, strategy.getFileInput(), "File input should match the provided value");
            assertEquals(replaceAndInvert, strategy.getReplaceAndInvert(), "ReplaceAndInvert option should match the provided value");
        }

        @Test
        @DisplayName("Getters and setters update fields correctly")
        void testGettersAndSetters() {
            // Arrange
            MultipartFile mockFile1 = new MockMultipartFile("file1", "test1.pdf", "application/pdf", "content1".getBytes());
            MultipartFile mockFile2 = new MockMultipartFile("file2", "test2.pdf", "application/pdf", "content2".getBytes());

            // Act
            ReplaceAndInvertColorStrategy strategy = new ConcreteReplaceAndInvertColorStrategy(mockFile1, ReplaceAndInvert.CUSTOM_COLOR);

            // Assert initial values
            assertEquals(mockFile1, strategy.getFileInput(), "Initial file input should match");
            assertEquals(ReplaceAndInvert.CUSTOM_COLOR, strategy.getReplaceAndInvert(), "Initial ReplaceAndInvert should match");

            // Update via setters
            strategy.setFileInput(mockFile2);
            strategy.setReplaceAndInvert(ReplaceAndInvert.FULL_INVERSION);

            // Assert updated values
            assertEquals(mockFile2, strategy.getFileInput(), "Updated file input should match");
            assertEquals(ReplaceAndInvert.FULL_INVERSION, strategy.getReplaceAndInvert(), "Updated ReplaceAndInvert should match");
        }
    }

    @Nested
    @DisplayName("Replace Method Tests")
    class ReplaceMethodTests {

        @Test
        @DisplayName("Replace method returns non-null InputStreamResource")
        void testReplace() throws IOException {
            // Arrange
            byte[] content = "test pdf content".getBytes();
            MultipartFile mockFile = new MockMultipartFile("file", "test.pdf", "application/pdf", content);
            ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.CUSTOM_COLOR;

            ReplaceAndInvertColorStrategy strategy = new ConcreteReplaceAndInvertColorStrategy(mockFile, replaceAndInvert);

            // Act
            InputStreamResource result = strategy.replace();

            // Assert
            assertNotNull(result, "Result from replace should not be null");
        }

        @Test
        @DisplayName("Replace method handles empty content gracefully")
        void testReplaceWithEmptyContent() throws IOException {
            // Arrange
            MultipartFile emptyFile = new MockMultipartFile("file", "empty.pdf", "application/pdf", new byte[0]);
            ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.CUSTOM_COLOR;

            ReplaceAndInvertColorStrategy strategy = new ConcreteReplaceAndInvertColorStrategy(emptyFile, replaceAndInvert);

            // Act
            InputStreamResource result = strategy.replace();

            // Assert
            assertNotNull(result, "Result should not be null even for empty content");
            assertEquals(0, result.contentLength(), "Content length should be 0 for empty file");
        }
    }
}
