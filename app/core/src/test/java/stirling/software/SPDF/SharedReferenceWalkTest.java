package stirling.software.SPDF;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.lang.reflect.Method;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.controller.api.EditTableOfContentsController;
import stirling.software.SPDF.controller.api.security.GetInfoOnPDF;
import stirling.software.SPDF.service.AttachmentService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Walkers over PDF object graphs must visit a shared or cyclic object once. */
class SharedReferenceWalkTest {

    private static final Duration LIMIT = Duration.ofSeconds(10);

    /** One page, one bookmark whose /Next points back at itself. */
    private static PDDocument selfLinkedOutline() {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage());
        PDDocumentOutline outline = new PDDocumentOutline();
        PDOutlineItem item = new PDOutlineItem();
        item.setTitle("loop");
        outline.addLast(item);
        item.getCOSObject().setItem(COSName.NEXT, item.getCOSObject());
        document.getDocumentCatalog().setDocumentOutline(outline);
        return document;
    }

    @Test
    void extractBookmarksStopsAtAnOutlineCycle() throws Exception {
        CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
        MockMultipartFile file =
                new MockMultipartFile(
                        "file", "x.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[1]);
        when(factory.load(file)).thenReturn(selfLinkedOutline());
        EditTableOfContentsController controller =
                new EditTableOfContentsController(
                        factory, new ObjectMapper(), mock(TempFileManager.class));

        List<Map<String, Object>> bookmarks =
                assertTimeoutPreemptively(LIMIT, () -> controller.extractBookmarks(file).getBody());

        assertThat(bookmarks).hasSize(1);
        assertThat(bookmarks.get(0)).containsEntry("title", "loop");
    }

    @Test
    void getInfoBookmarksStopAtANestedOutlineCycle() throws Exception {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            PDDocumentOutline outline = new PDDocumentOutline();
            PDOutlineItem top = new PDOutlineItem();
            top.setTitle("top");
            outline.addLast(top);
            PDOutlineItem child = new PDOutlineItem();
            child.setTitle("child");
            top.addLast(child);
            child.getCOSObject().setItem(COSName.NEXT, child.getCOSObject());
            child.getCOSObject().setItem(COSName.FIRST, child.getCOSObject());
            document.getDocumentCatalog().setDocumentOutline(outline);

            JsonNode bookmarks =
                    assertTimeoutPreemptively(
                            LIMIT, () -> invokeGetInfo("extractBookmarks", document));

            assertThat(bookmarks.size()).isEqualTo(2);
        }
    }

    @Test
    void getInfoExpandsEachStructureElementOnce() throws Exception {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            PDStructureTreeRoot root = new PDStructureTreeRoot();
            document.getDocumentCatalog().setStructureTreeRoot(root);
            PDStructureElement section = new PDStructureElement("Sect", root);
            root.appendKid(section);
            PDStructureElement paragraph = new PDStructureElement("P", section);
            for (int i = 0; i < 3; i++) {
                section.appendKid(paragraph);
            }
            section.appendKid(section);

            JsonNode info =
                    assertTimeoutPreemptively(
                            LIMIT, () -> invokeGetInfo("extractOtherInfo", document));

            JsonNode tree = info.get("StructureTree");
            assertThat(tree.size()).isEqualTo(1);
            assertThat(tree.get(0).get("Children").size()).isEqualTo(1);
        }
    }

    @Test
    void attachmentsInARepeatedOrCyclicNameTreeAreListedOnce() throws Exception {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            PDComplexFileSpecification spec = new PDComplexFileSpecification();
            spec.setFile("a.txt");
            spec.setEmbeddedFile(
                    new PDEmbeddedFile(document, new ByteArrayInputStream(new byte[] {1})));
            PDEmbeddedFilesNameTreeNode leaf = new PDEmbeddedFilesNameTreeNode();
            leaf.setNames(Map.of("a.txt", spec));
            PDEmbeddedFilesNameTreeNode root = new PDEmbeddedFilesNameTreeNode();
            root.setKids(List.of(leaf));
            COSArray kids = root.getCOSObject().getCOSArray(COSName.KIDS);
            kids.add(leaf.getCOSObject());
            kids.add(root.getCOSObject());
            PDDocumentNameDictionary names =
                    new PDDocumentNameDictionary(document.getDocumentCatalog());
            names.setEmbeddedFiles(root);
            document.getDocumentCatalog().setNames(names);

            var attachments =
                    assertTimeoutPreemptively(
                            LIMIT, () -> new AttachmentService().listAttachments(document));

            assertThat(attachments).hasSize(1);
        }
    }

    private static JsonNode invokeGetInfo(String name, PDDocument document) throws Exception {
        Method method = GetInfoOnPDF.class.getDeclaredMethod(name, PDDocument.class);
        method.setAccessible(true);
        return (JsonNode) method.invoke(null, document);
    }
}
