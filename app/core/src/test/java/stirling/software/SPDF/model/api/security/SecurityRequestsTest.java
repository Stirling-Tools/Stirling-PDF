package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class SecurityRequestsTest {

    @Nested
    @DisplayName("AddWatermarkRequest")
    class Watermark {

        @Test
        @DisplayName("all accessors round-trip")
        void roundTrip() {
            AddWatermarkRequest req = new AddWatermarkRequest();
            req.setWatermarkType("text");
            req.setWatermarkText("DRAFT");
            req.setWatermarkImage(new MockMultipartFile("img", new byte[] {1}));
            req.setAlphabet("roman");
            req.setFontSize(24f);
            req.setRotation(45f);
            req.setOpacity(0.3f);
            req.setWidthSpacer(10);
            req.setHeightSpacer(20);
            req.setCustomColor("#ffffff");
            req.setConvertPDFToImage(true);

            assertThat(req.getWatermarkType()).isEqualTo("text");
            assertThat(req.getWatermarkText()).isEqualTo("DRAFT");
            assertThat(req.getWatermarkImage()).isNotNull();
            assertThat(req.getAlphabet()).isEqualTo("roman");
            assertThat(req.getFontSize()).isEqualTo(24f);
            assertThat(req.getRotation()).isEqualTo(45f);
            assertThat(req.getOpacity()).isEqualTo(0.3f);
            assertThat(req.getWidthSpacer()).isEqualTo(10);
            assertThat(req.getHeightSpacer()).isEqualTo(20);
            assertThat(req.getCustomColor()).isEqualTo("#ffffff");
            assertThat(req.getConvertPDFToImage()).isTrue();
        }

        @Test
        @DisplayName("equals/hashCode/toString generated")
        void equality() {
            AddWatermarkRequest a = new AddWatermarkRequest();
            a.setWatermarkText("X");
            AddWatermarkRequest b = new AddWatermarkRequest();
            b.setWatermarkText("X");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a).isNotEqualTo(new AddWatermarkRequest());
            assertThat(a.toString()).contains("AddWatermarkRequest");
        }
    }

    @Nested
    @DisplayName("SignPDFWithCertRequest")
    class SignCert {

        @Test
        @DisplayName("all accessors round-trip")
        void roundTrip() {
            SignPDFWithCertRequest req = new SignPDFWithCertRequest();
            req.setCertType("PKCS12");
            req.setPrivateKeyFile(new MockMultipartFile("k", new byte[] {1}));
            req.setCertFile(new MockMultipartFile("c", new byte[] {2}));
            req.setP12File(new MockMultipartFile("p", new byte[] {3}));
            req.setJksFile(new MockMultipartFile("j", new byte[] {4}));
            req.setPassword("pw");
            req.setShowSignature(true);
            req.setReason("because");
            req.setLocation("here");
            req.setName("Signer");
            req.setPageNumber(2);
            req.setShowLogo(false);

            assertThat(req.getCertType()).isEqualTo("PKCS12");
            assertThat(req.getPrivateKeyFile()).isNotNull();
            assertThat(req.getCertFile()).isNotNull();
            assertThat(req.getP12File()).isNotNull();
            assertThat(req.getJksFile()).isNotNull();
            assertThat(req.getPassword()).isEqualTo("pw");
            assertThat(req.getShowSignature()).isTrue();
            assertThat(req.getReason()).isEqualTo("because");
            assertThat(req.getLocation()).isEqualTo("here");
            assertThat(req.getName()).isEqualTo("Signer");
            assertThat(req.getPageNumber()).isEqualTo(2);
            assertThat(req.getShowLogo()).isFalse();
        }

        @Test
        @DisplayName("equals/hashCode/toString generated")
        void equality() {
            SignPDFWithCertRequest a = new SignPDFWithCertRequest();
            a.setCertType("JKS");
            SignPDFWithCertRequest b = new SignPDFWithCertRequest();
            b.setCertType("JKS");

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a).isNotEqualTo(new SignPDFWithCertRequest());
            assertThat(a.toString()).contains("SignPDFWithCertRequest");
        }
    }

    @Nested
    @DisplayName("AddPasswordRequest")
    class AddPassword {

        @Test
        @DisplayName("key length defaults to 256")
        void defaultKeyLength() {
            assertThat(new AddPasswordRequest().getKeyLength()).isEqualTo(256);
        }

        @Test
        @DisplayName("all permission flags and passwords round-trip")
        void roundTrip() {
            AddPasswordRequest req = new AddPasswordRequest();
            req.setOwnerPassword("owner");
            req.setPassword("user");
            req.setKeyLength(128);
            req.setPreventAssembly(true);
            req.setPreventExtractContent(true);
            req.setPreventExtractForAccessibility(true);
            req.setPreventFillInForm(true);
            req.setPreventModify(true);
            req.setPreventModifyAnnotations(true);
            req.setPreventPrinting(true);
            req.setPreventPrintingFaithful(true);

            assertThat(req.getOwnerPassword()).isEqualTo("owner");
            assertThat(req.getPassword()).isEqualTo("user");
            assertThat(req.getKeyLength()).isEqualTo(128);
            assertThat(req.getPreventAssembly()).isTrue();
            assertThat(req.getPreventExtractContent()).isTrue();
            assertThat(req.getPreventExtractForAccessibility()).isTrue();
            assertThat(req.getPreventFillInForm()).isTrue();
            assertThat(req.getPreventModify()).isTrue();
            assertThat(req.getPreventModifyAnnotations()).isTrue();
            assertThat(req.getPreventPrinting()).isTrue();
            assertThat(req.getPreventPrintingFaithful()).isTrue();
            assertThat(req.toString()).contains("AddPasswordRequest");
        }
    }

    @Nested
    @DisplayName("SanitizePdfRequest")
    class Sanitize {

        @Test
        @DisplayName("boolean toggles round-trip")
        void roundTrip() {
            SanitizePdfRequest req = new SanitizePdfRequest();
            req.setRemoveJavaScript(true);
            req.setRemoveEmbeddedFiles(false);
            req.setRemoveXMPMetadata(true);
            req.setRemoveMetadata(true);
            req.setRemoveLinks(false);
            req.setRemoveFonts(true);

            assertThat(req.getRemoveJavaScript()).isTrue();
            assertThat(req.getRemoveEmbeddedFiles()).isFalse();
            assertThat(req.getRemoveXMPMetadata()).isTrue();
            assertThat(req.getRemoveMetadata()).isTrue();
            assertThat(req.getRemoveLinks()).isFalse();
            assertThat(req.getRemoveFonts()).isTrue();
        }

        @Test
        @DisplayName("equals and hashCode generated")
        void equality() {
            SanitizePdfRequest a = new SanitizePdfRequest();
            a.setRemoveFonts(true);
            SanitizePdfRequest b = new SanitizePdfRequest();
            b.setRemoveFonts(true);

            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }
    }

    @Nested
    @DisplayName("RedactPdfRequest")
    class Redact {

        @Test
        @DisplayName("text, flags, color and padding round-trip")
        void roundTrip() {
            RedactPdfRequest req = new RedactPdfRequest();
            req.setListOfText("a,b");
            req.setUseRegex(true);
            req.setWholeWordSearch(true);
            req.setRedactColor("#ff0000");
            req.setCustomPadding(2.5f);
            req.setConvertPDFToImage(true);

            assertThat(req.getListOfText()).isEqualTo("a,b");
            assertThat(req.getUseRegex()).isTrue();
            assertThat(req.getWholeWordSearch()).isTrue();
            assertThat(req.getRedactColor()).isEqualTo("#ff0000");
            assertThat(req.getCustomPadding()).isEqualTo(2.5f);
            assertThat(req.getConvertPDFToImage()).isTrue();
            assertThat(req.toString()).contains("RedactPdfRequest");
        }
    }
}
