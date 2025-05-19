package stirling.software.SPDF.utils.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.InputStreamResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.ReplaceAndInvert;

class ReplaceAndInvertColorStrategyTest {

    // A concrete implementation of the abstract class for testing
    private static class ConcreteReplaceAndInvertColorStrategy
            extends ReplaceAndInvertColorStrategy {

        public ConcreteReplaceAndInvertColorStrategy(
                MultipartFile file, ReplaceAndInvert replaceAndInvert) {
            super(file, replaceAndInvert);
        }

        @Override
        public InputStreamResource replace() throws IOException {
            // Simple implementation for testing purposes
            return new InputStreamResource(getFileInput().getInputStream());
        }
    }

    @Test
    void testConstructor() {
        // Arrange
        MultipartFile mockFile =
                new MockMultipartFile(
                        "file", "test.pdf", "application/pdf", "test content".getBytes());
        ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.CUSTOM_COLOR;

        // Act
        ReplaceAndInvertColorStrategy strategy =
                new ConcreteReplaceAndInvertColorStrategy(mockFile, replaceAndInvert);

        // Assert
        assertNotNull(strategy, "Strategy should be initialized");
        assertEquals(mockFile, strategy.getFileInput(), "File input should be set correctly");
        assertEquals(
                replaceAndInvert,
                strategy.getReplaceAndInvert(),
                "ReplaceAndInvert option should be set correctly");
    }

    @Test
    void testReplace() throws IOException {
        // Arrange
        byte[] content = "test pdf content".getBytes();
        MultipartFile mockFile =
                new MockMultipartFile("file", "test.pdf", "application/pdf", content);
        ReplaceAndInvert replaceAndInvert = ReplaceAndInvert.CUSTOM_COLOR;

        ReplaceAndInvertColorStrategy strategy =
                new ConcreteReplaceAndInvertColorStrategy(mockFile, replaceAndInvert);

        // Act
        InputStreamResource result = strategy.replace();

        // Assert
        assertNotNull(result, "Result should not be null");
    }

    @Test
    void testGettersAndSetters() {
        // Arrange
        MultipartFile mockFile1 =
                new MockMultipartFile(
                        "file1", "test1.pdf", "application/pdf", "content1".getBytes());
        MultipartFile mockFile2 =
                new MockMultipartFile(
                        "file2", "test2.pdf", "application/pdf", "content2".getBytes());

        // Act
        ReplaceAndInvertColorStrategy strategy =
                new ConcreteReplaceAndInvertColorStrategy(mockFile1, ReplaceAndInvert.CUSTOM_COLOR);

        // Test initial values
        assertEquals(mockFile1, strategy.getFileInput());
        assertEquals(ReplaceAndInvert.CUSTOM_COLOR, strategy.getReplaceAndInvert());

        // Test setters
        strategy.setFileInput(mockFile2);
        strategy.setReplaceAndInvert(ReplaceAndInvert.FULL_INVERSION);

        // Assert new values
        assertEquals(mockFile2, strategy.getFileInput());
        assertEquals(ReplaceAndInvert.FULL_INVERSION, strategy.getReplaceAndInvert());
    }
}
