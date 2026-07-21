package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import stirling.software.SPDF.model.api.misc.AutoSplitPdfRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

/**
 * Additional branch coverage for {@link AutoSplitPdfController}: the actual splitting that happens
 * when a recognised QR divider is embedded mid-document, plus duplex-mode skipping of the divider
 * back page. QR images are generated with zxing; no rendering of external resources is required.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AutoSplitPdfController additional branch tests")
class AutoSplitPdfControllerMoreTest {

    private static final String VALID_QR = "https://stirlingpdf.com";

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    private ApplicationProperties applicationProperties;
    private AutoSplitPdfController controller;

    @TempDir java.nio.file.Path tempDir;

    @BeforeEach
    void setUp() throws Exception {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().setMaxDPI(150);
        controller =
                new AutoSplitPdfController(
                        pdfDocumentFactory, tempFileManager, applicationProperties);
        when(tempFileManager.createTempFile(".zip"))
                .thenAnswer(inv -> Files.createTempFile(tempDir, "split", ".zip").toFile());
        when(pdfDocumentFactory.load(any(InputStream.class)))
                .thenAnswer(inv -> Loader.loadPDF(inv.<InputStream>getArgument(0).readAllBytes()));
    }

    private static BufferedImage qrImage(String text, int size) throws Exception {
        QRCodeWriter writer = new QRCodeWriter();
        java.util.Map<EncodeHintType, Object> hints = new java.util.EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
        hints.put(EncodeHintType.MARGIN, 4);
        BitMatrix matrix = writer.encode(text, BarcodeFormat.QR_CODE, size, size, hints);
        int w = matrix.getWidth();
        int h = matrix.getHeight();
        BufferedImage image = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < w; x++) {
            for (int y = 0; y < h; y++) {
                image.setRGB(x, y, matrix.get(x, y) ? Color.BLACK.getRGB() : Color.WHITE.getRGB());
            }
        }
        return image;
    }

    private static void addPlainPage(PDDocument doc) {
        doc.addPage(new PDPage(new PDRectangle(300, 300)));
    }

    private static void addQrDividerPage(PDDocument doc, BufferedImage qr) throws Exception {
        PDPage page = new PDPage(new PDRectangle(300, 300));
        doc.addPage(page);
        PDImageXObject xobj = LosslessFactory.createFromImage(doc, qr);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.drawImage(xobj, 25, 25, 250, 250);
        }
    }

    private byte[] docToBytes(PDDocument doc) throws Exception {
        try (doc) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static AutoSplitPdfRequest request(byte[] bytes, Boolean duplex) {
        AutoSplitPdfRequest req = new AutoSplitPdfRequest();
        req.setFileInput(new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", bytes));
        req.setDuplexMode(duplex);
        return req;
    }

    private static List<String> zipEntries(Resource res) throws Exception {
        List<String> names = new ArrayList<>();
        try (InputStream in = res.getInputStream();
                ZipInputStream zis = new ZipInputStream(in)) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                names.add(e.getName());
                zis.closeEntry();
            }
        }
        return names;
    }

    @Nested
    @DisplayName("Splitting on a QR divider")
    class QrDividerSplit {

        @Test
        @DisplayName("a mid-document QR divider produces two output PDFs")
        void dividerProducesTwoDocs() throws Exception {
            BufferedImage qr = qrImage(VALID_QR, 250);
            PDDocument doc = new PDDocument();
            addPlainPage(doc); // content section 1
            addQrDividerPage(doc, qr); // divider -> starts section 2
            addPlainPage(doc); // content section 2
            byte[] bytes = docToBytes(doc);

            ResponseEntity<Resource> response = controller.autoSplitPdf(request(bytes, false));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            List<String> names = zipEntries(response.getBody());
            // First doc = page 1; second doc = divider page + page 3.
            assertThat(names).hasSize(2);
            assertThat(names).containsExactly("doc_1.pdf", "doc_2.pdf");
        }

        @Test
        @DisplayName("duplex mode drops the page following the divider")
        void duplexDropsBackPage() throws Exception {
            BufferedImage qr = qrImage(VALID_QR, 250);
            PDDocument doc = new PDDocument();
            addPlainPage(doc); // section 1
            addQrDividerPage(doc, qr); // divider
            addPlainPage(doc); // back of divider -> skipped in duplex
            addPlainPage(doc); // section 2 content
            byte[] bytes = docToBytes(doc);

            ResponseEntity<Resource> response = controller.autoSplitPdf(request(bytes, true));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            List<String> names = zipEntries(response.getBody());
            assertThat(names).hasSize(2);
        }

        @Test
        @DisplayName("output PDFs from a divider split are individually loadable")
        void outputsAreLoadable() throws Exception {
            BufferedImage qr = qrImage(VALID_QR, 250);
            PDDocument doc = new PDDocument();
            addPlainPage(doc);
            addQrDividerPage(doc, qr);
            addPlainPage(doc);
            byte[] bytes = docToBytes(doc);

            ResponseEntity<Resource> response = controller.autoSplitPdf(request(bytes, false));

            int total = 0;
            try (InputStream in = response.getBody().getInputStream();
                    ZipInputStream zis = new ZipInputStream(in)) {
                ZipEntry e;
                while ((e = zis.getNextEntry()) != null) {
                    byte[] entry = zis.readAllBytes();
                    try (PDDocument loaded = Loader.loadPDF(entry)) {
                        total += loaded.getNumberOfPages();
                    }
                    zis.closeEntry();
                }
            }
            // 3 source pages: the QR divider page itself is consumed as a boundary, leaving
            // page 1 in the first doc and page 3 in the second (2 pages total).
            assertThat(total).isEqualTo(2);
        }
    }
}
