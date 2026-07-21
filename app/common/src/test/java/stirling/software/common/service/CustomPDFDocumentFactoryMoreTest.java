package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.io.RandomAccessStreamCache.StreamCacheCreateFunction;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

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
}
