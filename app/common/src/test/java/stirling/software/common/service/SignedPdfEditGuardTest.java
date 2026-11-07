package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIOSource;
import stirling.software.common.model.tool.ToolIOSpec;

class SignedPdfEditGuardTest {

    private static final String ROTATE = "/api/v1/general/rotate-pdf";
    private static final String CERT_SIGN = "/api/v1/security/cert-sign";
    private static final String TO_IMAGE = "/api/v1/convert/pdf/img";
    private static final ToolIOSource TOOL_IO =
            ToolIOSource.of(
                    Map.of(
                            ROTATE, spec(ToolFormat.PDF),
                            CERT_SIGN, spec(ToolFormat.PDF),
                            TO_IMAGE, spec(ToolFormat.IMAGE)));

    private ApplicationProperties properties;
    private SignedPdfEditGuard guard;

    @BeforeEach
    void setUp() {
        properties = new ApplicationProperties();
        guard = new SignedPdfEditGuard(properties, TOOL_IO);
    }

    @AfterEach
    void clearRequest() {
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void isOffByDefault() throws IOException {
        assertThat(properties.getSecurity().isBlockSignedPdfEdits()).isFalse();
        requestTo(ROTATE);
        try (PDDocument signed = Loader.loadPDF(signedPdf())) {
            assertThatCode(() -> guard.check(signed)).doesNotThrowAnyException();
        }
    }

    @Test
    void refusesToRewriteASignedPdf() throws IOException {
        properties.getSecurity().setBlockSignedPdfEdits(true);
        requestTo(ROTATE);
        try (PDDocument signed = Loader.loadPDF(signedPdf())) {
            assertThatThrownBy(() -> guard.check(signed))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("digitally signed");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {CERT_SIGN, TO_IMAGE, "/api/v1/info/unknown"})
    void stillAllowsSigningAgainAndReadOnlyOutputs(String endpoint) throws IOException {
        properties.getSecurity().setBlockSignedPdfEdits(true);
        requestTo(endpoint);
        try (PDDocument signed = Loader.loadPDF(signedPdf())) {
            assertThatCode(() -> guard.check(signed)).doesNotThrowAnyException();
        }
    }

    @Test
    void readsTheEndpointAToolJobRunsOnItsWorkerThread() throws IOException {
        properties.getSecurity().setBlockSignedPdfEdits(true);
        try (PDDocument signed = Loader.loadPDF(signedPdf())) {
            assertThatThrownBy(
                            () ->
                                    ToolRequestEndpoint.callWith(
                                            ROTATE,
                                            () -> {
                                                try {
                                                    guard.check(signed);
                                                    return null;
                                                } catch (IOException e) {
                                                    throw new IllegalStateException(e);
                                                }
                                            }))
                    .isInstanceOf(ResponseStatusException.class);
            assertThat(ToolRequestEndpoint.current()).isEmpty();
        }
    }

    @Test
    void leavesUnsignedPdfsAlone() throws IOException {
        properties.getSecurity().setBlockSignedPdfEdits(true);
        requestTo(ROTATE);
        try (PDDocument plain = new PDDocument()) {
            plain.addPage(new PDPage());
            assertThatCode(() -> guard.check(plain)).doesNotThrowAnyException();
        }
    }

    @Test
    void theFactoryRefusesWriteLoadsButNotReadOnlyOnes() throws IOException {
        properties.getSecurity().setBlockSignedPdfEdits(true);
        requestTo(ROTATE);
        CustomPDFDocumentFactory factory =
                new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
        factory.setSignedPdfEditGuard(guard);
        byte[] signed = signedPdf();

        try (PDDocument readOnly = factory.load(signed, true)) {
            assertThat(readOnly.getSignatureDictionaries()).hasSize(1);
        }
        assertThatThrownBy(() -> factory.load(signed, false))
                .isInstanceOf(ResponseStatusException.class);
    }

    private static void requestTo(String endpoint) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", endpoint);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    private static ToolIOSpec spec(ToolFormat produces) {
        return new ToolIOSpec(Set.of(ToolFormat.PDF), produces, ToolArity.SISO, List.of());
    }

    private static byte[] signedPdf() throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            PDAcroForm form = new PDAcroForm(document);
            document.getDocumentCatalog().setAcroForm(form);
            PDSignatureField field = new PDSignatureField(form);
            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            field.setValue(signature);
            form.getFields().add(field);
            document.save(output);
            return output.toByteArray();
        }
    }
}
