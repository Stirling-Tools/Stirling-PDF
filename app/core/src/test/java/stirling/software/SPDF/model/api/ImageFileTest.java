package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

@DisplayName("ImageFile")
class ImageFileTest {

    @Test
    @DisplayName("fileInput accessor round-trips")
    void roundTrip() {
        ImageFile file = new ImageFile();
        MockMultipartFile mock = new MockMultipartFile("img", new byte[] {1, 2});
        file.setFileInput(mock);

        assertThat(file.getFileInput()).isSameAs(mock);
    }

    @Test
    @DisplayName("equals/hashCode for equal pair sharing the same file")
    void equalPair() {
        MockMultipartFile mock = new MockMultipartFile("img", new byte[] {1});
        ImageFile a = new ImageFile();
        a.setFileInput(mock);
        ImageFile b = new ImageFile();
        b.setFileInput(mock);

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("not equal to null or unrelated type")
    void notEqual() {
        ImageFile a = new ImageFile();
        a.setFileInput(new MockMultipartFile("img", new byte[] {1}));
        assertThat(a).isNotEqualTo(new ImageFile()).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name")
    void toStringContent() {
        assertThat(new ImageFile().toString()).contains("ImageFile");
    }
}
