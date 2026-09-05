package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.AttachmentInfo;

class PortfolioServiceTest {

    private PortfolioService portfolioService;
    private AttachmentService attachmentService;

    @BeforeEach
    void setUp() {
        portfolioService = new PortfolioService();
        attachmentService = new AttachmentService();
    }

    private List<MultipartFile> sampleFiles() {
        return List.of(
                new MockMultipartFile("files", "notes.txt", "text/plain", "hello world".getBytes()),
                new MockMultipartFile("files", "data.csv", "text/csv", "a,b,c\n1,2,3".getBytes()));
    }

    @Test
    void createPortfolio_marksDocumentAsPortfolioWithCoverAndMembers() throws IOException {
        try (PDDocument document = portfolioService.createPortfolio(sampleFiles(), "My Bundle")) {
            assertTrue(portfolioService.isPortfolio(document));
            assertEquals(1, document.getNumberOfPages(), "cover page should be present");

            List<AttachmentInfo> members = attachmentService.listAttachments(document);
            assertEquals(2, members.size());
            assertTrue(members.stream().anyMatch(a -> "notes.txt".equals(a.getFilename())));
            assertTrue(members.stream().anyMatch(a -> "data.csv".equals(a.getFilename())));
        }
    }

    @Test
    void createPortfolio_survivesSaveAndReload() throws IOException {
        byte[] bytes;
        try (PDDocument document = portfolioService.createPortfolio(sampleFiles(), null);
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            document.save(baos);
            bytes = baos.toByteArray();
        }

        try (PDDocument reloaded = Loader.loadPDF(bytes)) {
            assertTrue(portfolioService.isPortfolio(reloaded));
            assertEquals(2, attachmentService.listAttachments(reloaded).size());
        }
    }

    @Test
    void flattenPortfolio_removesCollectionButKeepsMembers() throws IOException {
        try (PDDocument document = portfolioService.createPortfolio(sampleFiles(), null)) {
            assertTrue(portfolioService.isPortfolio(document));

            portfolioService.flattenPortfolio(document);

            assertFalse(portfolioService.isPortfolio(document));
            assertEquals(2, attachmentService.listAttachments(document).size());
        }
    }

    @Test
    void isPortfolio_falseForPlainDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new org.apache.pdfbox.pdmodel.PDPage());
            assertFalse(portfolioService.isPortfolio(document));
        }
    }

    @Test
    void createPortfolio_emptyListThrows() {
        assertThrows(
                IllegalArgumentException.class,
                () -> portfolioService.createPortfolio(List.of(), null));
    }
}
