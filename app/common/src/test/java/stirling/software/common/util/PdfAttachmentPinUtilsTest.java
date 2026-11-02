package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationFileAttachment;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.api.misc.AttachmentPinSpec;

class PdfAttachmentPinUtilsTest {

    @Test
    void addsPinOnRequestedPageAndReadsItBack() throws Exception {
        try (PDDocument document = documentWithAttachment("report.pdf")) {
            int applied =
                    PdfAttachmentPinUtils.applyPins(
                            document,
                            List.of(new AttachmentPinSpec("report.pdf", 1, 0.25f, 0.75f)),
                            List.of());

            assertEquals(1, applied);
            assertTrue(document.getPage(0).getAnnotations().isEmpty());
            assertEquals(1, document.getPage(1).getAnnotations().size());
            assertInstanceOf(
                    PDAnnotationFileAttachment.class, document.getPage(1).getAnnotations().get(0));

            AttachmentPinSpec pin = PdfAttachmentPinUtils.findPin(document, "REPORT.PDF");
            assertNotNull(pin);
            assertEquals(1, pin.pageIndex());
            assertEquals(0.25f, pin.x(), 0.001f);
            assertEquals(0.75f, pin.y(), 0.001f);

            Map<String, AttachmentPinSpec> pins = PdfAttachmentPinUtils.findPins(document);
            assertTrue(pins.containsKey("report.pdf"));
        }
    }

    @Test
    void roundTripsPinThroughRotation() throws Exception {
        for (int rotation : List.of(90, 180, 270)) {
            try (PDDocument document = documentWithAttachment("report.pdf")) {
                document.getPage(0).setRotation(rotation);

                PdfAttachmentPinUtils.applyPins(
                        document,
                        List.of(new AttachmentPinSpec("report.pdf", 0, 0.25f, 0.75f)),
                        List.of());

                AttachmentPinSpec pin = PdfAttachmentPinUtils.findPin(document, "report.pdf");
                assertNotNull(pin, "rotation " + rotation);
                assertEquals(0.25f, pin.x(), 0.001f, "rotation " + rotation);
                assertEquals(0.75f, pin.y(), 0.001f, "rotation " + rotation);
            }
        }
    }

    @Test
    void placesPinAtDisplayedCoordinatesForEachRotation() throws Exception {
        int[] rotations = {0, 90, 180, 270};
        float[][] expectedCenters = {{50f, 75f}, {150f, 75f}, {150f, 225f}, {50f, 225f}};

        for (int index = 0; index < rotations.length; index++) {
            int rotation = rotations[index];
            try (PDDocument document = documentWithAttachment("report.pdf")) {
                document.getPage(0).setRotation(rotation);
                PdfAttachmentPinUtils.applyPins(
                        document,
                        List.of(new AttachmentPinSpec("report.pdf", 0, 0.25f, 0.75f)),
                        List.of());

                PDAnnotationFileAttachment annotation =
                        assertInstanceOf(
                                PDAnnotationFileAttachment.class,
                                document.getPage(0).getAnnotations().get(0));
                PDRectangle rectangle = annotation.getRectangle();
                float centerX = rectangle.getLowerLeftX() + rectangle.getWidth() / 2f;
                float centerY = rectangle.getLowerLeftY() + rectangle.getHeight() / 2f;

                assertEquals(
                        expectedCenters[index][0], centerX, 0.01f, "x at " + rotation + " degrees");
                assertEquals(
                        expectedCenters[index][1], centerY, 0.01f, "y at " + rotation + " degrees");
            }
        }
    }

    @Test
    void removesPinAfterRenameByNewName() throws Exception {
        try (PDDocument document = documentWithAttachment("report.pdf")) {
            PdfAttachmentPinUtils.applyPins(
                    document,
                    List.of(new AttachmentPinSpec("report.pdf", 0, 0.4f, 0.55f)),
                    List.of());

            renameFileSpecification(document, "report.pdf", "renamed.pdf");
            PdfAttachmentPinUtils.removePins(document, List.of("renamed.pdf"));

            assertTrue(PdfAttachmentPinUtils.findPins(document).isEmpty());
        }
    }

    @Test
    void applyingRenamedPinReplacesTheOldAnnotation() throws Exception {
        try (PDDocument document = documentWithAttachment("report.pdf")) {
            PdfAttachmentPinUtils.applyPins(
                    document,
                    List.of(new AttachmentPinSpec("report.pdf", 0, 0.4f, 0.55f)),
                    List.of());

            renameFileSpecification(document, "report.pdf", "renamed.pdf");
            PdfAttachmentPinUtils.applyPins(
                    document,
                    List.of(new AttachmentPinSpec("renamed.pdf", 0, 0.6f, 0.45f)),
                    List.of());

            assertEquals(1, document.getPage(0).getAnnotations().size());
            AttachmentPinSpec pin = PdfAttachmentPinUtils.findPin(document, "renamed.pdf");
            assertNotNull(pin);
            assertEquals(0.6f, pin.x(), 0.001f);
            assertEquals(0.45f, pin.y(), 0.001f);
        }
    }

    @Test
    void replacesExistingPinAndRemovesIt() throws Exception {
        try (PDDocument document = documentWithAttachment("report.pdf")) {
            PdfAttachmentPinUtils.applyPins(
                    document,
                    List.of(new AttachmentPinSpec("report.pdf", 0, 0.2f, 0.2f)),
                    List.of());
            PdfAttachmentPinUtils.applyPins(
                    document,
                    List.of(new AttachmentPinSpec("report.pdf", 1, 0.8f, 0.8f)),
                    List.of());

            assertEquals(0, document.getPage(0).getAnnotations().size());
            assertEquals(1, document.getPage(1).getAnnotations().size());

            PdfAttachmentPinUtils.removePins(document, List.of("report.pdf"));
            assertTrue(PdfAttachmentPinUtils.findPins(document).isEmpty());
        }
    }

    @Test
    void skipsMissingFilesAndInvalidPages() throws Exception {
        try (PDDocument document = documentWithAttachment("report.pdf")) {
            int applied =
                    PdfAttachmentPinUtils.applyPins(
                            document,
                            List.of(
                                    new AttachmentPinSpec("missing.pdf", 0, 0.5f, 0.5f),
                                    new AttachmentPinSpec("report.pdf", 9, 0.5f, 0.5f)),
                            List.of());

            assertEquals(0, applied);
            assertTrue(document.getPage(0).getAnnotations().isEmpty());
            assertTrue(document.getPage(1).getAnnotations().isEmpty());
        }
    }

    @Test
    void survivesSaveAndReload() throws Exception {
        byte[] saved;
        try (PDDocument document = documentWithAttachment("report.pdf")) {
            PdfAttachmentPinUtils.applyPins(
                    document,
                    List.of(new AttachmentPinSpec("report.pdf", 0, 0.5f, 0.5f)),
                    List.of());
            try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                document.save(output);
                saved = output.toByteArray();
            }
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            AttachmentPinSpec pin = PdfAttachmentPinUtils.findPin(reloaded, "report.pdf");
            assertNotNull(pin);
            assertEquals(0.5f, pin.x(), 0.001f);
            assertEquals(0.5f, pin.y(), 0.001f);
            assertNull(PdfAttachmentPinUtils.findPin(reloaded, "missing.pdf"));
        }
    }

    private static void renameFileSpecification(PDDocument document, String oldName, String newName)
            throws Exception {
        PDEmbeddedFilesNameTreeNode tree =
                document.getDocumentCatalog().getNames().getEmbeddedFiles();
        Map<String, PDComplexFileSpecification> names = new LinkedHashMap<>(tree.getNames());
        PDComplexFileSpecification specification = names.remove(oldName);
        specification.setFile(newName);
        specification.setFileUnicode(newName);
        names.put(newName, specification);
        tree.setNames(names);
    }

    private static PDDocument documentWithAttachment(String filename) throws Exception {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage(new PDRectangle(200, 300)));
        document.addPage(new PDPage(new PDRectangle(200, 300)));

        byte[] data = "attachment data".getBytes(StandardCharsets.UTF_8);
        PDEmbeddedFile embeddedFile = new PDEmbeddedFile(document, new ByteArrayInputStream(data));
        embeddedFile.setSize(data.length);

        PDComplexFileSpecification fileSpecification = new PDComplexFileSpecification();
        fileSpecification.setFile(filename);
        fileSpecification.setFileUnicode(filename);
        fileSpecification.setEmbeddedFile(embeddedFile);
        fileSpecification.setEmbeddedFileUnicode(embeddedFile);

        PDEmbeddedFilesNameTreeNode tree = new PDEmbeddedFilesNameTreeNode();
        tree.setNames(Map.of(filename, fileSpecification));
        PDDocumentNameDictionary names =
                new PDDocumentNameDictionary(document.getDocumentCatalog());
        names.setEmbeddedFiles(tree);
        document.getDocumentCatalog().setNames(names);
        return document;
    }
}
