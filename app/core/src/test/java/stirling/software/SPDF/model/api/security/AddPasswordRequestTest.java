package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

@DisplayName("AddPasswordRequest")
class AddPasswordRequestTest {

    @Nested
    @DisplayName("defaults")
    class Defaults {

        @Test
        @DisplayName("keyLength defaults to 256 and permission flags are null")
        void defaults() {
            AddPasswordRequest req = new AddPasswordRequest();
            assertThat(req.getKeyLength()).isEqualTo(256);
            assertThat(req.getOwnerPassword()).isNull();
            assertThat(req.getPassword()).isNull();
            assertThat(req.getPreventAssembly()).isNull();
            assertThat(req.getPreventExtractContent()).isNull();
            assertThat(req.getPreventExtractForAccessibility()).isNull();
            assertThat(req.getPreventFillInForm()).isNull();
            assertThat(req.getPreventModify()).isNull();
            assertThat(req.getPreventModifyAnnotations()).isNull();
            assertThat(req.getPreventPrinting()).isNull();
            assertThat(req.getPreventPrintingFaithful()).isNull();
        }
    }

    @Nested
    @DisplayName("accessors")
    class Accessors {

        @Test
        @DisplayName("all accessors round-trip including inherited fields")
        void roundTrip() {
            AddPasswordRequest req = new AddPasswordRequest();
            req.setOwnerPassword("owner");
            req.setPassword("user");
            req.setKeyLength(128);
            req.setPreventAssembly(true);
            req.setPreventExtractContent(true);
            req.setPreventExtractForAccessibility(false);
            req.setPreventFillInForm(true);
            req.setPreventModify(false);
            req.setPreventModifyAnnotations(true);
            req.setPreventPrinting(false);
            req.setPreventPrintingFaithful(true);
            req.setFileId("file-1");
            req.setFileInput(new MockMultipartFile("f", new byte[] {1}));

            assertThat(req.getOwnerPassword()).isEqualTo("owner");
            assertThat(req.getPassword()).isEqualTo("user");
            assertThat(req.getKeyLength()).isEqualTo(128);
            assertThat(req.getPreventAssembly()).isTrue();
            assertThat(req.getPreventExtractContent()).isTrue();
            assertThat(req.getPreventExtractForAccessibility()).isFalse();
            assertThat(req.getPreventFillInForm()).isTrue();
            assertThat(req.getPreventModify()).isFalse();
            assertThat(req.getPreventModifyAnnotations()).isTrue();
            assertThat(req.getPreventPrinting()).isFalse();
            assertThat(req.getPreventPrintingFaithful()).isTrue();
            assertThat(req.getFileId()).isEqualTo("file-1");
            assertThat(req.getFileInput()).isNotNull();
        }
    }

    @Nested
    @DisplayName("equals/hashCode/toString")
    class EqualityContract {

        @Test
        @DisplayName("equal pair shares hashCode")
        void equalPair() {
            AddPasswordRequest a = new AddPasswordRequest();
            a.setPassword("pw");
            AddPasswordRequest b = new AddPasswordRequest();
            b.setPassword("pw");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }

        @Test
        @DisplayName("differs when a subclass field differs")
        void notEqualOnFieldDiff() {
            AddPasswordRequest a = new AddPasswordRequest();
            a.setKeyLength(128);
            AddPasswordRequest b = new AddPasswordRequest();
            b.setKeyLength(256);

            assertThat(a).isNotEqualTo(b);
        }

        @Test
        @DisplayName("not equal to null or unrelated type")
        void notEqualToOthers() {
            AddPasswordRequest a = new AddPasswordRequest();
            assertThat(a).isNotEqualTo(null).isNotEqualTo("string");
        }

        @Test
        @DisplayName("toString contains class name and a field value")
        void toStringContent() {
            AddPasswordRequest a = new AddPasswordRequest();
            a.setPassword("secret");
            assertThat(a.toString()).contains("AddPasswordRequest").contains("secret");
        }
    }
}
