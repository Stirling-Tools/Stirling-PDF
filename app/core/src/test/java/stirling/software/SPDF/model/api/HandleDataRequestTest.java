package stirling.software.SPDF.model.api;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("HandleDataRequest")
class HandleDataRequestTest {

    @Test
    @DisplayName("accessors round-trip")
    void roundTrip() {
        HandleDataRequest req = new HandleDataRequest();
        MultipartFile[] files = {
            new MockMultipartFile("a", new byte[] {1}), new MockMultipartFile("b", new byte[] {2})
        };
        req.setFileInput(files);
        req.setJson("{\"name\":\"pipeline\"}");

        assertThat(req.getFileInput()).hasSize(2);
        assertThat(req.getJson()).isEqualTo("{\"name\":\"pipeline\"}");
    }

    // Lombok deep-compares the array via Arrays.equals.
    @Test
    @DisplayName("equal arrays with same content are equal; different content not")
    void arrayEquality() {
        HandleDataRequest a = new HandleDataRequest();
        a.setFileInput(new MultipartFile[] {new MockMultipartFile("a", new byte[] {1})});
        a.setJson("same");

        HandleDataRequest b = new HandleDataRequest();
        b.setFileInput(a.getFileInput());
        b.setJson("same");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

        HandleDataRequest c = new HandleDataRequest();
        c.setFileInput(new MultipartFile[] {new MockMultipartFile("z", new byte[] {9})});
        c.setJson("same");
        assertThat(a).isNotEqualTo(c);
    }

    @Test
    @DisplayName("differs when json differs and vs null/other type")
    void notEqual() {
        HandleDataRequest a = new HandleDataRequest();
        a.setJson("a");
        HandleDataRequest b = new HandleDataRequest();
        b.setJson("b");

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name")
    void toStringContent() {
        assertThat(new HandleDataRequest().toString()).contains("HandleDataRequest");
    }
}
