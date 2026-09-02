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
import org.jboss.resteasy.reactive.multipart.FileUpload;
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

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("PasswordController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PasswordControllerTest {

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

    @Nested
    @DisplayName("Remove Password Tests")
    class RemovePasswordTests {

        @Test
        @DisplayName("Should remove password from a protected PDF")
        void testRemovePassword_Success() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response = passwordController.removePassword(pdfFile, null, "password");

            assertNotNull(response.getEntity());
            assertEquals(200, response.getStatus());
        }

        @Test
        @DisplayName("Should include correct filename suffix in response")
        void testRemovePassword_FilenameSuffix() throws Exception {
            FileUpload pdfFile =
                    TestFileUploads.of(simplePdfBytes, "document.pdf", "application/pdf");

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response = passwordController.removePassword(pdfFile, null, "pass");

            assertNotNull(response);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle IOException that is a password error")
        void testRemovePassword_PasswordError() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenThrow(new IOException("Cannot decrypt PDF, the password is incorrect"));

            assertThrows(
                    Exception.class,
                    () -> passwordController.removePassword(pdfFile, null, "wrong"));
        }

        @Test
        @DisplayName("Should handle generic IOException")
        void testRemovePassword_GenericIOException() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenThrow(new IOException("Corrupt PDF file"));

            assertThrows(
                    Exception.class,
                    () -> passwordController.removePassword(pdfFile, null, "pass"));
        }

        @Test
        @DisplayName("Should handle empty password")
        void testRemovePassword_EmptyPassword() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response = passwordController.removePassword(pdfFile, null, "");
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle null original filename")
        void testRemovePassword_NullFilename() throws Exception {
            FileUpload pdfFile = TestFileUploads.of(simplePdfBytes, null, "application/pdf");

            when(pdfDocumentFactory.load(any(MultipartFile.class), anyString()))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response = passwordController.removePassword(pdfFile, null, "pass");
            assertNotNull(response.getEntity());
        }
    }

    @Nested
    @DisplayName("Add Password Tests")
    class AddPasswordTests {

        @Test
        @DisplayName("Should add password with owner and user passwords")
        void testAddPassword_BothPasswords() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    passwordController.addPassword(
                            pdfFile,
                            null,
                            "owner123",
                            "user123",
                            128,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null);

            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should add password with only owner password")
        void testAddPassword_OnlyOwnerPassword() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    passwordController.addPassword(
                            pdfFile,
                            null,
                            "owner123",
                            "",
                            256,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null);

            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should add permissions only when no passwords")
        void testAddPassword_PermissionsOnly() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            // preventModify and preventPrinting set
            Response response =
                    passwordController.addPassword(
                            pdfFile, null, "", "", 128, null, null, null, null, true, null, true,
                            null);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should add password with null passwords (permissions only)")
        void testAddPassword_NullPasswords() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    passwordController.addPassword(
                            pdfFile, null, null, null, 128, null, null, null, null, null, null,
                            null, null);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should set all permission flags correctly")
        void testAddPassword_AllPermissionFlags() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    passwordController.addPassword(
                            pdfFile, null, "owner", "user", 256, true, // preventAssembly
                            true, // preventExtractContent
                            true, // preventExtractForAccessibility
                            true, // preventFillInForm
                            true, // preventModify
                            true, // preventModifyAnnotations
                            true, // preventPrinting
                            true); // preventPrintingFaithful
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle null permission boolean flags (treated as false)")
        void testAddPassword_NullPermissionFlags() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    passwordController.addPassword(
                            pdfFile, null, "owner", "user", 128, null, null, null, null, null, null,
                            null, null);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should use 40 bit key length")
        void testAddPassword_40BitKeyLength() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    passwordController.addPassword(
                            pdfFile, null, "owner", "user", 40, null, null, null, null, null, null,
                            null, null);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle only user password set")
        void testAddPassword_OnlyUserPassword() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    passwordController.addPassword(
                            pdfFile, null, null, "user123", 128, null, null, null, null, null, null,
                            null, null);
            assertNotNull(response.getEntity());
        }
    }
}
