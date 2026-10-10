package stirling.software.SPDF.controller.api.form;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.controller.api.form.XfaFormController.XfaSyncResponse;
import stirling.software.SPDF.service.xfa.XfaFixtures;
import stirling.software.SPDF.service.xfa.XfaSyncReport;
import stirling.software.SPDF.service.xfa.XfaSyncService;
import stirling.software.common.service.CustomPDFDocumentFactory;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@DisplayName("XfaFormController")
class XfaFormControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private XfaFormController controller;

    @BeforeEach
    void setUp() {
        controller = new XfaFormController(pdfDocumentFactory, objectMapper, new XfaSyncService());
    }

    private static MockMultipartFile upload(PDDocument document) throws Exception {
        try (document) {
            return new MockMultipartFile(
                    "file", "form.pdf", "application/pdf", XfaFixtures.save(document));
        }
    }

    private static XfaSyncReport.FieldResult field(XfaSyncResponse body, String name) {
        return body.fields().stream()
                .filter(result -> result.name().equals(name))
                .findFirst()
                .orElseThrow();
    }

    @Test
    @DisplayName("returns the report and the synced PDF, which Acrobat would now read the same")
    void reportAndPdf() throws Exception {
        MockMultipartFile file = upload(XfaFixtures.hybrid());
        when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

        ResponseEntity<XfaSyncResponse> response = controller.syncXfa(file, null, true, null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        XfaSyncResponse body = response.getBody();
        assertThat(body.action()).isEqualTo(XfaSyncReport.Action.SYNCED);
        assertThat(body.usageRightsRemoved()).isTrue();
        assertThat(field(body, XfaFixtures.NOMBRE).before()).isEqualTo("Nombre viejo");
        try (PDDocument synced = Loader.loadPDF(body.pdf())) {
            assertThat(XfaFixtures.dataValues(synced))
                    .containsEntry("form1.Nombre", "IMGA S.L.")
                    .containsEntry("form1.Calidad", "2");
        }
        String json = objectMapper.writeValueAsString(body);
        assertThat(json)
                .contains("\"action\":\"synced\"")
                .contains("\"status\":\"updated\"")
                .contains("\"pdf\":\"");
    }

    @Test
    @DisplayName("with includePdf=false reads the PDF read-only and returns only the report")
    void reportOnly() throws Exception {
        MockMultipartFile file = upload(XfaFixtures.hybrid());
        when(pdfDocumentFactory.load(file, true)).thenReturn(Loader.loadPDF(file.getBytes()));

        XfaSyncResponse body = controller.syncXfa(file, "sync", false, null).getBody();

        assertThat(body.pdf()).isNull();
        assertThat(body.counts().updated()).isPositive();
        assertThat(objectMapper.writeValueAsString(body)).doesNotContain("\"pdf\"");
    }

    @Test
    @DisplayName("counts the fields named in changedFields as edited")
    void changedFieldsUnlockFormattedValues() throws Exception {
        MockMultipartFile file = upload(XfaFixtures.hybrid());
        when(pdfDocumentFactory.load(file, true)).thenReturn(Loader.loadPDF(file.getBytes()));
        byte[] changed = objectMapper.writeValueAsBytes(List.of(XfaFixtures.IMPORTE));

        XfaSyncResponse body = controller.syncXfa(file, null, false, changed).getBody();

        assertThat(field(body, XfaFixtures.IMPORTE).status())
                .isEqualTo(XfaSyncReport.Status.UPDATED);
    }

    @Test
    @DisplayName("mode=strip returns a PDF without XFA")
    void stripMode() throws Exception {
        MockMultipartFile file = upload(XfaFixtures.hybrid());
        when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

        XfaSyncResponse body = controller.syncXfa(file, "strip", true, null).getBody();

        assertThat(body.action()).isEqualTo(XfaSyncReport.Action.STRIPPED);
        try (PDDocument stripped = Loader.loadPDF(body.pdf())) {
            COSDictionary form =
                    stripped.getDocumentCatalog()
                            .getCOSObject()
                            .getCOSDictionary(COSName.ACRO_FORM);
            assertThat(form.getDictionaryObject(COSName.XFA)).isNull();
        }
    }

    @Test
    @DisplayName("rejects mode=none, which would make the call pointless")
    void rejectsNone() throws Exception {
        MockMultipartFile file = upload(XfaFixtures.hybrid());

        assertThatThrownBy(() -> controller.syncXfa(file, "none", true, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("rejects a PDF that has no XFA")
    void rejectsPlainPdf() throws Exception {
        PDDocument plain = new PDDocument();
        plain.addPage(new PDPage());
        plain.getDocumentCatalog().setAcroForm(new PDAcroForm(plain));
        MockMultipartFile file = upload(plain);
        when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

        assertThatThrownBy(() -> controller.syncXfa(file, null, true, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("no XFA");
    }

    @Test
    @DisplayName("rejects a dynamic XFA form, which only Acrobat can fill")
    void rejectsDynamicForm() throws Exception {
        MockMultipartFile file = upload(XfaFixtures.builder().withoutFields().build());
        when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

        assertThatThrownBy(() -> controller.syncXfa(file, null, true, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Acrobat");
    }
}
