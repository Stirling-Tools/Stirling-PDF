package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoVerifierBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.SPDF.model.api.security.SignPDFWithCertRequest;
import stirling.software.SPDF.service.HardwareKeyStoreService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.SignatureLogoStore;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class CertSignStampPlacementTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private HardwareKeyStoreService hardwareKeyStoreService;
    @Mock private SignatureLogoStore signatureLogoStore;
    @Mock private HttpServletRequest httpRequest;

    @InjectMocks private CertSignController certSignController;

    private byte[] pfxBytes;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
        lenient()
                .when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(inv.<MultipartFile>getArgument(0).getBytes()));
        try (InputStream in = new ClassPathResource("certs/test-cert.pfx").getInputStream()) {
            pfxBytes = in.readAllBytes();
        }
    }

    @Test
    void signsIntoAnEmptyFieldWithoutAddingANewOne() throws Exception {
        PDRectangle fieldBox = new PDRectangle(300, 400, 160, 60);
        byte[] pdf;
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.LETTER));
            PDPage second = new PDPage(PDRectangle.LETTER);
            doc.addPage(second);
            addSignatureField(doc, second, "Approver", fieldBox);
            pdf = save(doc);
        }

        SignPDFWithCertRequest request = request(pdf);
        request.setFieldName("Approver");
        request.setReason("Approved");
        request.setLocation("Leeds");
        byte[] signed = sign(request);

        try (PDDocument doc = Loader.loadPDF(signed)) {
            List<PDField> fields = doc.getDocumentCatalog().getAcroForm(null).getFields();
            assertEquals(1, fields.size());
            PDSignatureField field = (PDSignatureField) fields.getFirst();
            assertEquals("Approver", field.getFullyQualifiedName());
            PDSignature signature = field.getSignature();
            assertNotNull(signature);
            assertEquals("Approved", signature.getReason());
            assertEquals("Leeds", signature.getLocation());
            assertRect(fieldBox, field.getWidgets().getFirst().getRectangle());
            assertEquals(0, doc.getPage(0).getAnnotations().size());
            assertEquals(1, doc.getPage(1).getAnnotations().size());
            assertCmsVerifies(signed, signature);
            assertInkInside(doc, 1, fieldBox);
        }
    }

    @Test
    void aFieldThatIsAlreadySignedIsRejected() throws Exception {
        byte[] pdf;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            addSignatureField(doc, page, "Approver", new PDRectangle(300, 400, 160, 60));
            pdf = save(doc);
        }
        SignPDFWithCertRequest first = request(pdf);
        first.setFieldName("Approver");
        byte[] signedOnce = sign(first);

        SignPDFWithCertRequest second = request(signedOnce);
        second.setFieldName("Approver");
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> certSignController.signPDFWithCert(second, httpRequest));
        assertTrue(error.getMessage().contains("already signed"), error.getMessage());
    }

    @Test
    void aFieldThatDoesNotExistIsRejected() throws Exception {
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setFieldName("Missing");

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> certSignController.signPDFWithCert(request, httpRequest));
        assertTrue(error.getMessage().contains("fieldName Missing"), error.getMessage());
    }

    @Test
    void onlyAPageNumberStillSignsWithTheBoxInsetFromTheBottomRight() throws Exception {
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setPageNumber(1);

        try (PDDocument doc = Loader.loadPDF(sign(request))) {
            PDRectangle expected = new PDRectangle(612 - 36 - 200, 36, 200, 50);
            assertRect(expected, onlyWidget(doc).getRectangle());
            assertInkInside(doc, 0, expected);
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 90, 180, 270})
    void anExplicitBoxLandsWhereItWasPlacedOnACroppedRotatedPage(int rotation) throws Exception {
        PDRectangle crop = new PDRectangle(40, 60, 500, 700);
        boolean quarterTurned = rotation == 90 || rotation == 270;
        PDRectangle box =
                quarterTurned
                        ? new PDRectangle(200, 300, 60, 220)
                        : new PDRectangle(200, 300, 220, 60);
        SignPDFWithCertRequest request = request(blankLetter(rotation, crop));
        request.setX(box.getLowerLeftX());
        request.setY(box.getLowerLeftY());
        request.setWidth(box.getWidth());
        request.setHeight(box.getHeight());

        try (PDDocument doc = Loader.loadPDF(sign(request))) {
            assertRect(box, onlyWidget(doc).getRectangle());
            Ink ink = assertInkInside(doc, 0, box);
            int inkWidth = ink.maxX() - ink.minX();
            int inkHeight = ink.maxY() - ink.minY();
            assertTrue(
                    inkWidth > inkHeight,
                    "the stamp text should read across the page as displayed, ink was "
                            + inkWidth
                            + " x "
                            + inkHeight);
        }
    }

    @Test
    void aBoxOutsideThePageIsRejected() throws Exception {
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setX(500f);
        request.setY(700f);
        request.setWidth(200f);
        request.setHeight(50f);

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> certSignController.signPDFWithCert(request, httpRequest));
        assertTrue(error.getMessage().contains("outside page 1"), error.getMessage());
    }

    @Test
    void placementWithoutAVisibleSignatureIsRejected() throws Exception {
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setShowSignature(false);
        request.setFieldName("Approver");

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> certSignController.signPDFWithCert(request, httpRequest));
        assertTrue(error.getMessage().contains("showSignature"), error.getMessage());
    }

    @Test
    void theWatermarkIsTheSignatureLogoDrawnBehindTheStamp() throws Exception {
        when(signatureLogoStore.effective()).thenReturn(png(300, 100));
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setShowWatermark(true);
        try (PDDocument doc = Loader.loadPDF(sign(request))) {
            List<PDImageXObject> images = images(doc);
            assertEquals(1, images.size());
            assertEquals(300, images.getFirst().getWidth());
        }
    }

    @Test
    void showLogoStillTurnsTheWatermarkOnForOlderCallers() throws Exception {
        when(signatureLogoStore.effective()).thenReturn(png(300, 100));
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setShowLogo(true);
        try (PDDocument doc = Loader.loadPDF(sign(request))) {
            assertEquals(1, images(doc).size());
        }
    }

    @Test
    void theSignersImageFillsTheGraphicHalf() throws Exception {
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setStampGraphic("IMAGE");
        request.setSignatureImage(
                new MockMultipartFile("signatureImage", "sig.png", "image/png", png(120, 40)));
        try (PDDocument doc = Loader.loadPDF(sign(request))) {
            List<PDImageXObject> images = images(doc);
            assertEquals(1, images.size());
            assertEquals(120, images.getFirst().getWidth());
        }
    }

    @Test
    void noGraphicWithTheWatermarkDrawsOnlyTheWatermark() throws Exception {
        when(signatureLogoStore.effective()).thenReturn(png(300, 100));
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setStampGraphic("NONE");
        request.setShowWatermark(true);
        request.setSignatureImage(
                new MockMultipartFile("signatureImage", "sig.png", "image/png", png(120, 40)));
        try (PDDocument doc = Loader.loadPDF(sign(request))) {
            List<PDImageXObject> images = images(doc);
            assertEquals(1, images.size());
            assertEquals(300, images.getFirst().getWidth());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"PICTURE", "IMAGE"})
    void anUnknownGraphicOrAnImageGraphicWithoutAnImageIsRefused(String graphic) throws Exception {
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setStampGraphic(graphic);
        assertThrows(
                IllegalArgumentException.class,
                () -> certSignController.signPDFWithCert(request, httpRequest));
    }

    @Test
    void aSignatureImageThatIsNotAPngOrJpegIsRefused() throws Exception {
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setStampGraphic("IMAGE");
        request.setSignatureImage(
                new MockMultipartFile(
                        "signatureImage", "sig.gif", "image/gif", "GIF89a....".getBytes()));
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> certSignController.signPDFWithCert(request, httpRequest));
        assertTrue(error.getMessage().contains("signatureImage"), error.getMessage());
    }

    private static byte[] png(int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(image, "png", png);
        return png.toByteArray();
    }

    private static List<PDImageXObject> images(PDDocument doc) throws Exception {
        List<PDImageXObject> images = new ArrayList<>();
        collectImages(
                stampWidget(doc)
                        .getAppearance()
                        .getNormalAppearance()
                        .getAppearanceStream()
                        .getResources(),
                images);
        return images;
    }

    @Test
    void signingIsRefusedWhenTheCertificateIsNotTheOneReviewed() throws Exception {
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setExpectedCertificateSha256("00".repeat(32));
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> certSignController.signPDFWithCert(request, httpRequest));
        assertTrue(error.getMessage().contains("not the one you reviewed"), error.getMessage());

        KeyStore keystore = KeyStore.getInstance("PKCS12");
        keystore.load(new ByteArrayInputStream(pfxBytes), "password".toCharArray());
        X509Certificate signer =
                (X509Certificate) keystore.getCertificate(keystore.aliases().nextElement());
        SignPDFWithCertRequest matching = request(blankLetter(0, null));
        matching.setExpectedCertificateSha256(HardwareKeyStoreService.sha256(signer).toUpperCase());
        assertTrue(sign(matching).length > 0);
    }

    @Test
    void signedByNamesTheCertificateHolderWhileATypedNameFillsTheGraphic() throws Exception {
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setName("Somebody Else");
        String holder = certificateHolder();

        String text = stampText(sign(request));

        assertTrue(text.contains("Digitally signed by " + holder), text);
        assertTrue(text.contains("Somebody Else"), text);
        assertFalse(text.contains("signed by Somebody"), text);
    }

    @Test
    void withoutATypedNameTheGraphicShowsTheCertificateHolder() throws Exception {
        String holder = certificateHolder();

        String text = stampText(sign(request(blankLetter(0, null))));

        assertTrue(text.contains("Digitally signed by " + holder), text);
        assertTrue(text.startsWith(holder), text);
    }

    @Test
    void eachSentenceOfTheReasonStartsANewLine() {
        assertEquals(
                List.of("Reviewed.", "Approved for release, e.g. version 2.", "Ready!", "Go?"),
                CertSignController.CreateSignature.sentences(
                        List.of("Reviewed. Approved for release, e.g. version 2.", "Ready! Go?")));
    }

    @Test
    void aSignedByLabelWithoutTheNameIsRefused() throws Exception {
        SignPDFWithCertRequest request = request(blankLetter(0, null));
        request.setSignedByLabel("Signed by");
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> certSignController.signPDFWithCert(request, httpRequest));
        assertTrue(error.getMessage().contains("signedByLabel"), error.getMessage());
    }

    private static PDAnnotationWidget stampWidget(PDDocument doc) {
        PDSignatureField field =
                (PDSignatureField)
                        doc.getDocumentCatalog().getAcroForm(null).getFields().getFirst();
        return field.getWidgets().getFirst();
    }

    private static void collectImages(PDResources resources, List<PDImageXObject> images)
            throws Exception {
        if (resources == null) {
            return;
        }
        for (COSName name : resources.getXObjectNames()) {
            PDXObject xObject = resources.getXObject(name);
            if (xObject instanceof PDImageXObject image) {
                images.add(image);
            } else if (xObject instanceof PDFormXObject form) {
                collectImages(form.getResources(), images);
            }
        }
    }

    private String certificateHolder() throws Exception {
        KeyStore keystore = KeyStore.getInstance("PKCS12");
        keystore.load(new ByteArrayInputStream(pfxBytes), "password".toCharArray());
        X509Certificate cert =
                (X509Certificate) keystore.getCertificate(keystore.aliases().nextElement());
        String subject = cert.getSubjectX500Principal().getName();
        for (String part : subject.split(",")) {
            if (part.startsWith("CN=")) {
                return part.substring(3);
            }
        }
        return subject;
    }

    private static String stampText(byte[] signedPdf) throws Exception {
        try (PDDocument doc = Loader.loadPDF(signedPdf)) {
            PDAnnotationWidget widget = doc.getSignatureFields().getFirst().getWidgets().getFirst();
            PDFormXObject appearance = (PDFormXObject) widget.getNormalAppearanceStream();
            PDPage sheet = new PDPage(appearance.getBBox());
            doc.addPage(sheet);
            try (PDPageContentStream cs = new PDPageContentStream(doc, sheet)) {
                cs.drawForm(appearance);
            }
            PDFTextStripper stripper = new PDFTextStripper();
            int last = doc.getNumberOfPages();
            stripper.setStartPage(last);
            stripper.setEndPage(last);
            return stripper.getText(doc).replaceAll("\\s+", " ").trim();
        }
    }

    private SignPDFWithCertRequest request(byte[] pdf) {
        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdf));
        request.setCertType("PFX");
        request.setP12File(
                new MockMultipartFile(
                        "p12File", "test-cert.pfx", "application/x-pkcs12", pfxBytes));
        request.setPassword("password");
        request.setShowSignature(true);
        request.setShowLogo(false);
        return request;
    }

    private byte[] sign(SignPDFWithCertRequest request) throws Exception {
        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);
        try (InputStream in = response.getBody().getInputStream()) {
            return in.readAllBytes();
        }
    }

    private static byte[] blankLetter(int rotation, PDRectangle crop) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            page.setRotation(rotation);
            if (crop != null) {
                page.setCropBox(crop);
            }
            doc.addPage(page);
            return save(doc);
        }
    }

    private static byte[] save(PDDocument doc) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        doc.save(out);
        return out.toByteArray();
    }

    private static void addSignatureField(
            PDDocument doc, PDPage page, String name, PDRectangle rect) throws Exception {
        PDAcroForm form = new PDAcroForm(doc);
        doc.getDocumentCatalog().setAcroForm(form);
        PDSignatureField field = new PDSignatureField(form);
        field.setPartialName(name);
        PDAnnotationWidget widget = field.getWidgets().getFirst();
        widget.setRectangle(rect);
        widget.setPage(page);
        page.getAnnotations().add(widget);
        form.getFields().add(field);
    }

    private static PDAnnotationWidget onlyWidget(PDDocument doc) throws Exception {
        List<PDField> fields = doc.getDocumentCatalog().getAcroForm(null).getFields();
        assertEquals(1, fields.size());
        return fields.getFirst().getWidgets().getFirst();
    }

    private static void assertRect(PDRectangle expected, PDRectangle actual) {
        assertEquals(expected.getLowerLeftX(), actual.getLowerLeftX(), 0.01, "x");
        assertEquals(expected.getLowerLeftY(), actual.getLowerLeftY(), 0.01, "y");
        assertEquals(expected.getWidth(), actual.getWidth(), 0.01, "width");
        assertEquals(expected.getHeight(), actual.getHeight(), 0.01, "height");
    }

    private static void assertCmsVerifies(byte[] signedPdf, PDSignature signature)
            throws Exception {
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        try (InputStream in = new ClassPathResource("certs/test-cert.pfx").getInputStream()) {
            keyStore.load(in, "password".toCharArray());
        }
        X509Certificate cert =
                (X509Certificate) keyStore.getCertificate(keyStore.aliases().nextElement());
        CMSSignedData cms =
                new CMSSignedData(
                        new CMSProcessableByteArray(signature.getSignedContent(signedPdf)),
                        new ByteArrayInputStream(signature.getContents(signedPdf)));
        SignerInformation signer = cms.getSignerInfos().getSigners().iterator().next();
        assertTrue(signer.verify(new JcaSimpleSignerInfoVerifierBuilder().build(cert)));
    }

    private record Ink(int minX, int minY, int maxX, int maxY) {}

    private static Ink assertInkInside(PDDocument doc, int pageIndex, PDRectangle userBox)
            throws Exception {
        PDPage page = doc.getPage(pageIndex);
        BufferedImage image = new PDFRenderer(doc).renderImage(pageIndex, 1f);
        int[] ink = {Integer.MAX_VALUE, Integer.MAX_VALUE, -1, -1};
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int rgb = image.getRGB(x, y);
                int brightness = ((rgb >> 16) & 0xff) + ((rgb >> 8) & 0xff) + (rgb & 0xff);
                if (brightness < 3 * 160) {
                    ink[0] = Math.min(ink[0], x);
                    ink[1] = Math.min(ink[1], y);
                    ink[2] = Math.max(ink[2], x);
                    ink[3] = Math.max(ink[3], y);
                }
            }
        }
        assertTrue(ink[2] >= 0, "the stamp drew nothing on page " + (pageIndex + 1));
        float[] view = toRenderedView(page, userBox);
        float slack = 1.5f;
        assertTrue(
                ink[0] >= view[0] - slack
                        && ink[1] >= view[1] - slack
                        && ink[2] <= view[2] + slack
                        && ink[3] <= view[3] + slack,
                String.format(
                        "ink %d,%d-%d,%d is outside the placed box %.0f,%.0f-%.0f,%.0f",
                        ink[0], ink[1], ink[2], ink[3], view[0], view[1], view[2], view[3]));
        return new Ink(ink[0], ink[1], ink[2], ink[3]);
    }

    private static float[] toRenderedView(PDPage page, PDRectangle box) {
        PDRectangle crop = page.getCropBox();
        float left = box.getLowerLeftX() - crop.getLowerLeftX();
        float bottom = box.getLowerLeftY() - crop.getLowerLeftY();
        float right = box.getUpperRightX() - crop.getLowerLeftX();
        float top = box.getUpperRightY() - crop.getLowerLeftY();
        float w = crop.getWidth();
        float h = crop.getHeight();
        return switch (Math.floorMod(page.getRotation(), 360)) {
            case 90 -> new float[] {bottom, left, top, right};
            case 180 -> new float[] {w - right, bottom, w - left, top};
            case 270 -> new float[] {h - top, w - right, h - bottom, w - left};
            default -> new float[] {left, h - top, right, h - bottom};
        };
    }
}
