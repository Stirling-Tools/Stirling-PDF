package stirling.software.proprietary.integration.purview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.integration.purview.SensitivityLabel.AssignmentMethod;

/**
 * Exercises the label round-trip against real PDFBox documents, including a save/reload so the
 * assertions reflect what actually lands on disk rather than in-memory state.
 */
class PdfSensitivityLabelsTest {

    private static final String LABEL_ID = "2096f6a2-d2f7-48be-b329-b73aaa526e5d";
    private static final String TENANT = "cb46c030-1825-4e81-a295-151c039dbf02";

    private static PDDocument newDocument() {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        return document;
    }

    private static PDDocument saveAndReload(PDDocument document) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        document.close();
        return Loader.loadPDF(new ByteArrayInputStream(out.toByteArray()).readAllBytes());
    }

    private static String xmpString(PDDocument document) throws IOException {
        PDMetadata metadata = document.getDocumentCatalog().getMetadata();
        if (metadata == null) {
            return "";
        }
        try (InputStream is = metadata.exportXMPMetadata()) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static SensitivityLabel confidential() {
        return new SensitivityLabel(
                LABEL_ID,
                "Confidential",
                TENANT,
                AssignmentMethod.STANDARD,
                Instant.parse("2026-07-17T10:15:30Z"),
                SensitivityLabel.CONTENT_BITS_FOOTER);
    }

    @Test
    void appliedLabelSurvivesSaveAndReload() throws IOException {
        PDDocument document = newDocument();
        PdfSensitivityLabels.apply(document, confidential());

        try (PDDocument reloaded = saveAndReload(document)) {
            SensitivityLabel read = PdfSensitivityLabels.read(reloaded).orElseThrow();
            assertThat(read.labelId()).isEqualTo(LABEL_ID);
            assertThat(read.name()).isEqualTo("Confidential");
            assertThat(read.siteId()).isEqualTo(TENANT);
            assertThat(read.method()).isEqualTo(AssignmentMethod.STANDARD);
            assertThat(read.setDate()).isEqualTo(Instant.parse("2026-07-17T10:15:30Z"));
            assertThat(read.contentBits()).isEqualTo(SensitivityLabel.CONTENT_BITS_FOOTER);
        }
    }

    @Test
    void writesTheDocumentedKeyNamesIntoTheInfoDictionary() throws IOException {
        try (PDDocument document = newDocument()) {
            PdfSensitivityLabels.apply(document, confidential());

            var info = document.getDocumentInformation();
            String prefix = "MSIP_Label_" + LABEL_ID + "_";
            assertThat(info.getCustomMetadataValue(prefix + "Enabled")).isEqualTo("true");
            assertThat(info.getCustomMetadataValue(prefix + "SiteId")).isEqualTo(TENANT);
            assertThat(info.getCustomMetadataValue(prefix + "Method")).isEqualTo("Standard");
            assertThat(info.getCustomMetadataValue(prefix + "Name")).isEqualTo("Confidential");
            assertThat(info.getCustomMetadataValue(prefix + "ContentBits")).isEqualTo("2");
            // Extended ISO 8601, as the MIP contract specifies.
            assertThat(info.getCustomMetadataValue(prefix + "SetDate"))
                    .isEqualTo("2026-07-17T10:15:30+0000");
        }
    }

    @Test
    void readsALabelPresentOnlyInTheInfoDictionary() throws IOException {
        // What a third-party labeller may leave behind: no XMP copy at all.
        try (PDDocument document = newDocument()) {
            var info = document.getDocumentInformation();
            String prefix = "MSIP_Label_" + LABEL_ID + "_";
            info.setCustomMetadataValue(prefix + "Enabled", "true");
            info.setCustomMetadataValue(prefix + "SiteId", TENANT);
            info.setCustomMetadataValue(prefix + "Name", "Secret");

            SensitivityLabel read = PdfSensitivityLabels.read(document).orElseThrow();
            assertThat(read.name()).isEqualTo("Secret");
            assertThat(read.method()).isNull();
        }
    }

    @Test
    void unlabelledDocumentReadsAsEmpty() throws IOException {
        try (PDDocument document = newDocument()) {
            assertThat(PdfSensitivityLabels.read(document)).isEmpty();
        }
    }

    @Test
    void enabledFalseIsNotALabel() throws IOException {
        try (PDDocument document = newDocument()) {
            var info = document.getDocumentInformation();
            info.setCustomMetadataValue("MSIP_Label_" + LABEL_ID + "_Enabled", "false");
            info.setCustomMetadataValue("MSIP_Label_" + LABEL_ID + "_SiteId", TENANT);

            assertThat(PdfSensitivityLabels.read(document)).isEmpty();
        }
    }

    @Test
    void relabellingReplacesTheSameTenantsLabel() throws IOException {
        // "An object can only have one label from the same organization."
        String otherLabel = "11111111-2222-3333-4444-555555555555";
        try (PDDocument document = newDocument()) {
            PdfSensitivityLabels.apply(document, confidential());
            PdfSensitivityLabels.apply(
                    document,
                    new SensitivityLabel(
                            otherLabel, "Public", TENANT, AssignmentMethod.PRIVILEGED, null, null));

            assertThat(PdfSensitivityLabels.readAll(document))
                    .singleElement()
                    .satisfies(
                            label -> {
                                assertThat(label.labelId()).isEqualTo(otherLabel);
                                assertThat(label.name()).isEqualTo("Public");
                            });
        }
    }

    @Test
    void aDifferentTenantsLabelIsLeftAlone() throws IOException {
        String foreignTenant = "99999999-8888-7777-6666-555555555555";
        try (PDDocument document = newDocument()) {
            PdfSensitivityLabels.apply(
                    document,
                    new SensitivityLabel(
                            "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                            "Foreign",
                            foreignTenant,
                            null,
                            null,
                            null));
            PdfSensitivityLabels.apply(document, confidential());

            assertThat(PdfSensitivityLabels.readAll(document))
                    .hasSize(2)
                    .extracting(SensitivityLabel::siteId)
                    .containsExactlyInAnyOrder(foreignTenant, TENANT);
        }
    }

    @Test
    void aDifferentTenantsLabelStaysInTheXmpSurfaceToo() throws IOException {
        String foreignLabel = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
        PDDocument document = newDocument();
        PdfSensitivityLabels.apply(
                document,
                new SensitivityLabel(
                        foreignLabel,
                        "Foreign",
                        "99999999-8888-7777-6666-555555555555",
                        null,
                        null,
                        null));
        PdfSensitivityLabels.apply(document, confidential());

        try (PDDocument reloaded = saveAndReload(document)) {
            // The foreign label must survive on the XMP copy, not only in the info dictionary:
            // re-labelling replaces this tenant's labels, not everyone else's.
            String xmp = xmpString(reloaded);
            assertThat(xmp).contains("MSIP_Label_" + foreignLabel + "_");
            assertThat(xmp).contains("MSIP_Label_" + LABEL_ID + "_");
        }
    }

    @Test
    void clearRemovesEveryLabel() throws IOException {
        PDDocument document = newDocument();
        PdfSensitivityLabels.apply(document, confidential());
        PdfSensitivityLabels.clear(document);

        try (PDDocument reloaded = saveAndReload(document)) {
            assertThat(PdfSensitivityLabels.readAll(reloaded)).isEmpty();
        }
    }

    @Test
    void refusesALabelThatClaimsEncryption() throws IOException {
        try (PDDocument document = newDocument()) {
            SensitivityLabel encrypting =
                    new SensitivityLabel(
                            LABEL_ID,
                            "Highly Confidential",
                            TENANT,
                            AssignmentMethod.STANDARD,
                            null,
                            SensitivityLabel.CONTENT_BITS_ENCRYPT);

            // Marking content as protected without protecting it would mislead every reader.
            assertThatThrownBy(() -> PdfSensitivityLabels.apply(document, encrypting))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("cannot protect");
        }
    }

    @Test
    void preservesUnrelatedXmpAndInfoMetadata() throws IOException {
        PDDocument document = newDocument();
        document.getDocumentInformation().setAuthor("Anthony");
        document.getDocumentInformation().setCustomMetadataValue("StirlingPDFClassification", "{}");
        PdfSensitivityLabels.apply(document, confidential());

        try (PDDocument reloaded = saveAndReload(document)) {
            assertThat(reloaded.getDocumentInformation().getAuthor()).isEqualTo("Anthony");
            assertThat(
                            reloaded.getDocumentInformation()
                                    .getCustomMetadataValue("StirlingPDFClassification"))
                    .isEqualTo("{}");
            assertThat(PdfSensitivityLabels.read(reloaded)).isPresent();
        }
    }

    @Test
    void labelValuesAreCappedAtTheDocumentedLength() {
        SensitivityLabel longName =
                new SensitivityLabel(LABEL_ID, "x".repeat(400), TENANT, null, null, null);
        assertThat(longName.toMetadata().get("MSIP_Label_" + LABEL_ID + "_Name"))
                .hasSize(SensitivityLabel.MAX_VALUE_LENGTH);
    }

    @Test
    void labelRequiresIdAndTenant() {
        assertThatThrownBy(() -> new SensitivityLabel(null, "n", TENANT, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SensitivityLabel(LABEL_ID, "n", " ", null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsALabelIdThatIsNotAGuid() {
        // labelId is written into XMP/info key names verbatim; a space or markup char must not
        // pass,
        // or it would corrupt or inject the metadata packet it lands in.
        assertThatThrownBy(
                        () ->
                                new SensitivityLabel(
                                        "not a guid", "Public", TENANT, null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () ->
                                new SensitivityLabel(
                                        "<inject>-2222-3333-4444-5555555555",
                                        "Public",
                                        TENANT,
                                        null,
                                        null,
                                        null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
