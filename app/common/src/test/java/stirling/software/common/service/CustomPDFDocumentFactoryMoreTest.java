package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.color.ColorSpace;
import java.awt.color.ICC_Profile;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.io.RandomAccessStreamCache.StreamCacheCreateFunction;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.graphics.color.PDOutputIntent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class CustomPDFDocumentFactoryMoreTest {

    private CustomPDFDocumentFactory factory;
    private byte[] basePdfBytes;

    @BeforeEach
    void setUp() throws IOException {
        factory = new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
        try (InputStream is = getClass().getResourceAsStream("/example.pdf")) {
            basePdfBytes = is.readAllBytes();
        }
    }

    @Nested
    @DisplayName("null-argument guards")
    class NullGuards {

        @Test
        @DisplayName("each load overload rejects null with IllegalArgumentException")
        void nullArguments() {
            assertThatThrownBy(() -> factory.load((File) null))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> factory.load((Path) null))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> factory.load((byte[]) null))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> factory.load((InputStream) null))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> factory.load((InputStream) null, "pw"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("cache strategy selection (public overload)")
    class CacheStrategy {

        @Test
        @DisplayName("getStreamCacheFunction returns a non-null function for each size band")
        void cacheFunctionPerBand() {
            StreamCacheCreateFunction small = factory.getStreamCacheFunction(1024);
            StreamCacheCreateFunction mixed = factory.getStreamCacheFunction(20L * 1024 * 1024);
            StreamCacheCreateFunction large = factory.getStreamCacheFunction(60L * 1024 * 1024);
            assertThat(small).isNotNull();
            assertThat(mixed).isNotNull();
            assertThat(large).isNotNull();
        }
    }

    @Nested
    @DisplayName("create and round-trip helpers")
    class CreateAndRoundTrip {

        @Test
        @DisplayName("createNewDocument(MemoryUsageSetting) sets default metadata")
        void createWithMemorySetting() throws IOException {
            PdfMetadataService svc = mock(PdfMetadataService.class);
            CustomPDFDocumentFactory f = new CustomPDFDocumentFactory(svc);
            try (PDDocument doc = f.createNewDocument(MemoryUsageSetting.setupMainMemoryOnly())) {
                assertThat(doc).isNotNull();
                verify(svc).setDefaultMetadata(doc);
            }
        }

        @Test
        @DisplayName("loadToBytes(byte[]) round-trips a loadable PDF")
        void loadToBytesFromArray() throws IOException {
            byte[] out = factory.loadToBytes(basePdfBytes);
            try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(out)) {
                assertThat(doc.getNumberOfPages()).isPositive();
            }
        }

        @Test
        @DisplayName("createNewDocumentBasedOnOldDocument(byte[]) produces a fresh document")
        void newDocFromOldBytes() throws IOException {
            try (PDDocument doc = factory.createNewDocumentBasedOnOldDocument(basePdfBytes)) {
                assertThat(doc).isNotNull();
            }
        }

        @Test
        @DisplayName("createNewDocumentBasedOnOldDocument(File) produces a fresh document")
        void newDocFromOldFile(@TempDir Path tempDir) throws IOException {
            File f = Files.write(tempDir.resolve("old.pdf"), basePdfBytes).toFile();
            try (PDDocument doc = factory.createNewDocumentBasedOnOldDocument(f)) {
                assertThat(doc).isNotNull();
            }
        }

        @Test
        @DisplayName("createNewDocumentBasedOnOldDocument drops PDF/A and PDF/UA claims from XMP")
        void newDocDropsConformanceClaims() throws IOException {
            String xmp =
                    "<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?>"
                            + "<x:xmpmeta xmlns:x='adobe:ns:meta/'>"
                            + "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>"
                            + "<rdf:Description rdf:about=''"
                            + " xmlns:dc='http://purl.org/dc/elements/1.1/'"
                            + " xmlns:pdfaid='http://www.aiim.org/pdfa/ns/id/'"
                            + " xmlns:pdfuaid='http://www.aiim.org/pdfua/ns/id/'"
                            + " xmlns:cust='http://example.com/cust/' pdfaid:rev='2020'>"
                            + "<cust:Tags><rdf:Bag><rdf:li>A</rdf:li><rdf:li>B</rdf:li></rdf:Bag>"
                            + "</cust:Tags>"
                            + "<pdfaid:part>2</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>"
                            + "<pdfuaid:part>1</pdfuaid:part>"
                            + "<dc:title><rdf:Alt><rdf:li xml:lang='x-default'>Kept title</rdf:li>"
                            + "</rdf:Alt></dc:title>"
                            + "</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end='w'?>";
            byte[] source;
            try (PDDocument src = new PDDocument()) {
                src.addPage(new PDPage());
                PDMetadata metadata = new PDMetadata(src);
                metadata.importXMPMetadata(xmp.getBytes(StandardCharsets.UTF_8));
                src.getDocumentCatalog().setMetadata(metadata);
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                src.save(bos);
                source = bos.toByteArray();
            }

            try (PDDocument doc = factory.createNewDocumentBasedOnOldDocument(source)) {
                String kept =
                        new String(
                                doc.getDocumentCatalog().getMetadata().toByteArray(),
                                StandardCharsets.UTF_8);
                assertThat(kept).contains("Kept title");
                assertThat(kept).contains("<rdf:li>A</rdf:li><rdf:li>B</rdf:li>");
                assertThat(kept).doesNotContain("pdfaid:rev");
                assertThat(kept).doesNotContain("pdfa/ns/id").doesNotContain("pdfua/ns/id");
            }
        }

        @Test
        @DisplayName(
                "createNewDocumentBasedOnOldDocument keeps PDF 2.0 version and page-free catalog entries")
        void newDocKeepsVersionAndCatalogEntries() throws IOException {
            byte[] source;
            try (PDDocument src = new PDDocument()) {
                src.addPage(new PDPage());
                src.getDocument().setVersion(2.0f);
                COSDictionary catalog = src.getDocumentCatalog().getCOSObject();
                PDMetadata xmp = new PDMetadata(src);
                xmp.importXMPMetadata(
                        ("<x:xmpmeta xmlns:x='adobe:ns:meta/'><rdf:RDF"
                                        + " xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'/>"
                                        + "</x:xmpmeta>")
                                .getBytes(StandardCharsets.UTF_8));
                src.getDocumentCatalog().setMetadata(xmp);
                src.getDocumentCatalog().setLanguage("en-GB");
                PDOutputIntent intent =
                        new PDOutputIntent(
                                src,
                                new ByteArrayInputStream(
                                        ICC_Profile.getInstance(ColorSpace.CS_sRGB).getData()));
                intent.setOutputConditionIdentifier("sRGB");
                src.getDocumentCatalog().addOutputIntent(intent);
                PDComplexFileSpecification spec = new PDComplexFileSpecification();
                spec.setFile("data.csv");
                spec.setEmbeddedFile(
                        new PDEmbeddedFile(src, new ByteArrayInputStream("a,b".getBytes())));
                COSArray af = new COSArray();
                af.add(spec);
                catalog.setItem(COSName.AF, af);
                PDEmbeddedFilesNameTreeNode tree = new PDEmbeddedFilesNameTreeNode();
                tree.setNames(Map.of("data.csv", spec));
                PDDocumentNameDictionary names =
                        new PDDocumentNameDictionary(src.getDocumentCatalog());
                names.setEmbeddedFiles(tree);
                src.getDocumentCatalog().setNames(names);
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                src.save(bos);
                source = bos.toByteArray();
            }

            byte[] saved;
            try (PDDocument doc = factory.createNewDocumentBasedOnOldDocument(source)) {
                doc.addPage(new PDPage());
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                doc.save(bos);
                saved = bos.toByteArray();
            }

            assertThat(new String(saved, 0, 8, StandardCharsets.US_ASCII)).isEqualTo("%PDF-2.0");
            try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(saved)) {
                PDDocumentCatalog catalog = doc.getDocumentCatalog();
                assertThat(doc.getVersion()).isEqualTo(2.0f);
                assertThat(catalog.getVersion()).isEqualTo("2.0");
                assertThat(catalog.getMetadata().toByteArray()).isNotEmpty();
                assertThat(catalog.getLanguage()).isEqualTo("en-GB");
                assertThat(catalog.getOutputIntents()).hasSize(1);
                assertThat(catalog.getCOSObject().getCOSArray(COSName.AF)).hasSize(1);
                PDComplexFileSpecification kept =
                        catalog.getNames().getEmbeddedFiles().getNames().get("data.csv");
                assertThat(kept.getEmbeddedFile().toByteArray()).isEqualTo("a,b".getBytes());
            }
        }
    }

    @Nested
    @DisplayName("read-only and password handling")
    class ReadOnlyAndPassword {

        @Test
        @DisplayName("read-only load from file skips post-processing")
        void readOnlyFromFile(@TempDir Path tempDir) throws IOException {
            PdfMetadataService svc = mock(PdfMetadataService.class);
            CustomPDFDocumentFactory f = new CustomPDFDocumentFactory(svc);
            File file = Files.write(tempDir.resolve("ro.pdf"), basePdfBytes).toFile();
            try (PDDocument doc = f.load(file, true)) {
                assertThat(doc).isNotNull();
                org.mockito.Mockito.verify(svc, org.mockito.Mockito.never())
                        .setDefaultMetadata(org.mockito.ArgumentMatchers.any());
            }
        }

        @Test
        @DisplayName("encrypted PDF is decrypted on the default (non-read-only) load path")
        void encryptedPdfDecrypted() throws IOException {
            byte[] encrypted = buildEncryptedPdf("ownerpw", "userpw");
            // load(InputStream, password) drives removePassword + setAllSecurityToBeRemoved so the
            // returned document can be re-saved with no password set.
            byte[] decryptedSaved;
            try (PDDocument doc =
                    factory.load(new ByteArrayInputStream(encrypted), "userpw", false)) {
                assertThat(doc.getNumberOfPages()).isPositive();
                decryptedSaved = factory.saveToBytes(doc);
            }
            // Re-loading with no password proves security was stripped.
            try (PDDocument reloaded = org.apache.pdfbox.Loader.loadPDF(decryptedSaved)) {
                assertThat(reloaded.isEncrypted()).isFalse();
            }
        }

        @Test
        @DisplayName("MultipartFile with positive small size uses byte[] path")
        void smallMultipartLoadsViaBytes() throws IOException {
            MockMultipartFile multipart =
                    new MockMultipartFile(
                            "file", "s.pdf", MediaType.APPLICATION_PDF_VALUE, basePdfBytes);
            try (PDDocument doc = factory.load(multipart)) {
                assertThat(doc.getNumberOfPages()).isPositive();
            }
        }
    }

    private static byte[] buildEncryptedPdf(String ownerPw, String userPw) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            AccessPermission ap = new AccessPermission();
            StandardProtectionPolicy spp = new StandardProtectionPolicy(ownerPw, userPw, ap);
            spp.setEncryptionKeyLength(128);
            doc.protect(spp);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    @Nested
    @DisplayName("MultipartFile streams")
    class MultipartStreams {

        @Test
        @DisplayName("closes the stream it opens for large and password-protected loads")
        void closesOpenedStream() throws IOException {
            List<ClosingTracker> opened = new ArrayList<>();
            MultipartFile file = mock(MultipartFile.class);
            when(file.getSize()).thenReturn(CustomPDFDocumentFactory.SMALL_FILE_THRESHOLD + 1);
            when(file.getInputStream())
                    .thenAnswer(
                            invocation -> {
                                ClosingTracker in = new ClosingTracker(basePdfBytes);
                                opened.add(in);
                                return in;
                            });

            try (PDDocument doc = factory.load(file, false)) {
                assertThat(doc.getNumberOfPages()).isPositive();
            }
            try (PDDocument doc = factory.load(file, (String) null)) {
                assertThat(doc.getNumberOfPages()).isPositive();
            }

            assertThat(opened).hasSize(2).allMatch(in -> in.closed);
        }

        @Test
        @DisplayName("fails before parsing when closing the stream fails")
        void closeFailureLeavesNoDocument() throws IOException {
            AtomicInteger parses = new AtomicInteger();
            CustomPDFDocumentFactory countingFactory =
                    new CustomPDFDocumentFactory(mock(PdfMetadataService.class)) {
                        @Override
                        protected StreamCacheCreateFunction getStreamCacheFunction(
                                long contentSize, MemorySnapshot mem) {
                            parses.incrementAndGet();
                            return super.getStreamCacheFunction(contentSize, mem);
                        }
                    };
            MultipartFile file = mock(MultipartFile.class);
            when(file.getSize()).thenReturn(CustomPDFDocumentFactory.SMALL_FILE_THRESHOLD + 1);
            when(file.getInputStream())
                    .thenAnswer(
                            invocation ->
                                    new ByteArrayInputStream(basePdfBytes) {
                                        @Override
                                        public void close() throws IOException {
                                            throw new IOException("close failed");
                                        }
                                    });

            assertThatThrownBy(() -> countingFactory.load(file, false)).hasMessage("close failed");
            assertThatThrownBy(() -> countingFactory.load(file, (String) null))
                    .hasMessage("close failed");
            assertThat(parses).hasValue(0);
        }
    }

    private static final class ClosingTracker extends ByteArrayInputStream {
        boolean closed;

        ClosingTracker(byte[] bytes) {
            super(bytes);
        }

        @Override
        public void close() throws IOException {
            closed = true;
            super.close();
        }
    }
}
