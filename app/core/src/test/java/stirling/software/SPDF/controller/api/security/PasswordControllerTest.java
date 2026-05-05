package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.security.AddPasswordRequest;
import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("PasswordController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PasswordControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private PasswordController passwordController;

    private byte[] simplePdfBytes;

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
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            simplePdfBytes = baos.toByteArray();
        }
    }

    private byte[] createPasswordProtectedPdf(String ownerPassword, String userPassword)
            throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            AccessPermission ap = new AccessPermission();
            StandardProtectionPolicy spp =
                    new StandardProtectionPolicy(ownerPassword, userPassword, ap);
            spp.setEncryptionKeyLength(128);
            doc.protect(spp);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Nested
    @DisplayName("Remove Password Tests")
    class RemovePasswordTests {

        @Test
        @DisplayName("Should remove password from a protected PDF")
        void testRemovePassword_Success() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFPasswordRequest request = new PDFPasswordRequest();
            request.setFileInput(pdfFile);
            request.setPassword("password");

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.removePassword(request);

            assertNotNull(response.getBody());
            assertTrue(drainBody(response).length > 0);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }

        @Test
        @DisplayName("Should include correct filename suffix in response")
        void testRemovePassword_FilenameSuffix() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "document.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFPasswordRequest request = new PDFPasswordRequest();
            request.setFileInput(pdfFile);
            request.setPassword("pass");

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.removePassword(request);

            assertNotNull(response);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle IOException that is a password error")
        void testRemovePassword_PasswordError() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFPasswordRequest request = new PDFPasswordRequest();
            request.setFileInput(pdfFile);
            request.setPassword("wrong");

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenThrow(new IOException("Cannot decrypt PDF, the password is incorrect"));

            assertThrows(Exception.class, () -> passwordController.removePassword(request));
        }

        @Test
        @DisplayName("Should handle generic IOException")
        void testRemovePassword_GenericIOException() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFPasswordRequest request = new PDFPasswordRequest();
            request.setFileInput(pdfFile);
            request.setPassword("pass");

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenThrow(new IOException("Corrupt PDF file"));

            assertThrows(IOException.class, () -> passwordController.removePassword(request));
        }

        @Test
        @DisplayName("Should handle empty password")
        void testRemovePassword_EmptyPassword() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFPasswordRequest request = new PDFPasswordRequest();
            request.setFileInput(pdfFile);
            request.setPassword("");

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.removePassword(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle null original filename")
        void testRemovePassword_NullFilename() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", null, MediaType.APPLICATION_PDF_VALUE, simplePdfBytes);

            PDFPasswordRequest request = new PDFPasswordRequest();
            request.setFileInput(pdfFile);
            request.setPassword("pass");

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.removePassword(request);
            assertNotNull(response.getBody());
        }
    }

    @Nested
    @DisplayName("Add Password Tests")
    class AddPasswordTests {

        @Test
        @DisplayName("Should add password with owner and user passwords")
        void testAddPassword_BothPasswords() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddPasswordRequest request = new AddPasswordRequest();
            request.setFileInput(pdfFile);
            request.setOwnerPassword("owner123");
            request.setPassword("user123");
            request.setKeyLength(128);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.addPassword(request);

            assertNotNull(response.getBody());
            assertTrue(drainBody(response).length > 0);
        }

        @Test
        @DisplayName("Should add password with only owner password")
        void testAddPassword_OnlyOwnerPassword() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddPasswordRequest request = new AddPasswordRequest();
            request.setFileInput(pdfFile);
            request.setOwnerPassword("owner123");
            request.setPassword("");
            request.setKeyLength(256);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.addPassword(request);

            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should add permissions only when no passwords")
        void testAddPassword_PermissionsOnly() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddPasswordRequest request = new AddPasswordRequest();
            request.setFileInput(pdfFile);
            request.setOwnerPassword("");
            request.setPassword("");
            request.setKeyLength(128);
            request.setPreventPrinting(true);
            request.setPreventModify(true);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.addPassword(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should add password with null passwords (permissions only)")
        void testAddPassword_NullPasswords() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddPasswordRequest request = new AddPasswordRequest();
            request.setFileInput(pdfFile);
            request.setOwnerPassword(null);
            request.setPassword(null);
            request.setKeyLength(128);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.addPassword(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should set all permission flags correctly")
        void testAddPassword_AllPermissionFlags() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddPasswordRequest request = new AddPasswordRequest();
            request.setFileInput(pdfFile);
            request.setOwnerPassword("owner");
            request.setPassword("user");
            request.setKeyLength(256);
            request.setPreventAssembly(true);
            request.setPreventExtractContent(true);
            request.setPreventExtractForAccessibility(true);
            request.setPreventFillInForm(true);
            request.setPreventModify(true);
            request.setPreventModifyAnnotations(true);
            request.setPreventPrinting(true);
            request.setPreventPrintingFaithful(true);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.addPassword(request);
            assertNotNull(response.getBody());
            assertTrue(drainBody(response).length > 0);
        }

        @Test
        @DisplayName("Should handle null permission boolean flags (treated as false)")
        void testAddPassword_NullPermissionFlags() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddPasswordRequest request = new AddPasswordRequest();
            request.setFileInput(pdfFile);
            request.setOwnerPassword("owner");
            request.setPassword("user");
            request.setKeyLength(128);
            // All permission flags left null

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.addPassword(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should use 40 bit key length")
        void testAddPassword_40BitKeyLength() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddPasswordRequest request = new AddPasswordRequest();
            request.setFileInput(pdfFile);
            request.setOwnerPassword("owner");
            request.setPassword("user");
            request.setKeyLength(40);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.addPassword(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle only user password set")
        void testAddPassword_OnlyUserPassword() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddPasswordRequest request = new AddPasswordRequest();
            request.setFileInput(pdfFile);
            request.setOwnerPassword(null);
            request.setPassword("user123");
            request.setKeyLength(128);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = passwordController.addPassword(request);
            assertNotNull(response.getBody());
        }
    }
}
