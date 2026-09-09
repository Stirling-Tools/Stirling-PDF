package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("MultiplePDFFiles")
class MultiplePDFFilesTest {

    @Test
    @DisplayName("fileInput array accessor round-trips")
    void roundTrip() {
        MultiplePDFFiles files = new MultiplePDFFiles();
        MultipartFile[] input = {
            new MockMultipartFile("a", new byte[] {1}), new MockMultipartFile("b", new byte[] {2})
        };
        files.setFileInput(input);

        assertThat(files.getFileInput()).hasSize(2).isSameAs(input);
    }

    // Lombok deep-compares the array via Arrays.equals.
    @Test
    @DisplayName("equal arrays with same content equal; different content not")
    void arrayEquality() {
        MultiplePDFFiles a = new MultiplePDFFiles();
        a.setFileInput(new MultipartFile[] {new MockMultipartFile("a", new byte[] {1})});
        MultiplePDFFiles b = new MultiplePDFFiles();
        b.setFileInput(a.getFileInput());

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

        MultiplePDFFiles c = new MultiplePDFFiles();
        c.setFileInput(new MultipartFile[] {new MockMultipartFile("z", new byte[] {9})});
        assertThat(a).isNotEqualTo(c);
    }

    @Test
    @DisplayName("not equal to null or unrelated type")
    void notEqual() {
        MultiplePDFFiles a = new MultiplePDFFiles();
        a.setFileInput(new MultipartFile[] {new MockMultipartFile("a", new byte[] {1})});
        assertThat(a).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name")
    void toStringContent() {
        assertThat(new MultiplePDFFiles().toString()).contains("MultiplePDFFiles");
    }
}
