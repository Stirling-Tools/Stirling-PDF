package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.json.JsonMapper;

class PdfSessionSecurityControllerTest {
    private static final String USER = " reader password ";
    private static final String OWNER = " owner password ";
    @TempDir Path directory;
    private PdfSessionSecurityController controller;

    @BeforeEach
    void setUp() throws Exception {
        var factory = mock(CustomPDFDocumentFactory.class);
        when(factory.load(any(MultipartFile.class), anyString(), eq(true)))
                .thenAnswer(
                        inv ->
                                Loader.loadPDF(
                                        inv.<MultipartFile>getArgument(0).getBytes(),
                                        inv.getArgument(1)));
        when(factory.load(any(InputStream.class), anyString(), eq(true)))
                .thenAnswer(
                        inv ->
                                Loader.loadPDF(
                                        inv.<InputStream>getArgument(0).readAllBytes(),
                                        inv.getArgument(1)));
        var tempFiles = mock(TempFileManager.class);
        when(tempFiles.createTempFile(anyString()))
                .thenAnswer(
                        inv ->
                                Files.createTempFile(directory, "unlock-", inv.getArgument(0))
                                        .toFile());
        when(tempFiles.createManagedTempFile(anyString()))
                .thenAnswer(inv -> new TempFile(tempFiles, inv.getArgument(0)));
        doAnswer(
                        inv -> {
                            Files.deleteIfExists(inv.<java.io.File>getArgument(0).toPath());
                            return null;
                        })
                .when(tempFiles)
                .deleteTempFile(any(java.io.File.class));
        controller =
                new PdfSessionSecurityController(factory, tempFiles, JsonMapper.builder().build());
    }

    private byte[] pdf(boolean encrypted, int bits) throws IOException {
        try (var document = new PDDocument();
                var output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            if (encrypted) {
                var permissions = new AccessPermission();
                permissions.setCanPrint(false);
                permissions.setCanExtractContent(false);
                var policy = new StandardProtectionPolicy(OWNER, USER, permissions);
                policy.setEncryptionKeyLength(bits);
                policy.setPreferAES(true);
                document.protect(policy);
            }
            document.save(output);
            return output.toByteArray();
        }
    }

    private MockMultipartFile upload(byte[] bytes) {
        return new MockMultipartFile("fileInput", "document.pdf", "application/pdf", bytes);
    }

    @Test
    void inspectAuthenticatesWithoutModifyingTheOriginal() throws Exception {
        byte[] original = pdf(true, 256);
        var request = new PDFPasswordRequest();
        request.setFileInput(upload(original));
        request.setPassword(USER);
        var info = controller.inspect(request);
        assertTrue(info.encrypted());
        assertFalse(info.ownerAuthenticated());
        assertFalse(info.signed());
        assertEquals(1, info.pageCount());
        assertEquals(0, info.permissions() & 4);
        assertArrayEquals(original, request.getFileInput().getBytes());
        request.setPassword(OWNER);
        assertTrue(controller.inspect(request).ownerAuthenticated());
        request.setPassword("incorrect");
        assertThrows(InvalidPasswordException.class, () -> controller.inspect(request));
    }

    @ParameterizedTest
    @CsvSource({"128,false", "128,true", "256,false", "256,true"})
    void restoresBothPasswordsAndRestrictionsFromEitherCredential(int bits, boolean owner)
            throws Exception {
        boolean qpdfAvailable;
        try {
            qpdfAvailable = new ProcessBuilder("qpdf", "--version").start().waitFor() == 0;
        } catch (IOException unavailable) {
            qpdfAvailable = false;
        }
        Assumptions.assumeTrue(
                qpdfAvailable, "qpdf must be on PATH for protection integration tests");
        byte[] original = pdf(true, bits);
        var response =
                controller.restore(
                        upload(pdf(false, bits)), upload(original), owner ? OWNER : USER);
        byte[] protectedBytes;
        try (var body = response.getBody().getInputStream()) {
            protectedBytes = body.readAllBytes();
        }
        assertThrows(InvalidPasswordException.class, () -> Loader.loadPDF(protectedBytes));
        assertThrows(
                InvalidPasswordException.class, () -> Loader.loadPDF(protectedBytes, "incorrect"));
        try (var user = Loader.loadPDF(protectedBytes, USER);
                var administrator = Loader.loadPDF(protectedBytes, OWNER)) {
            assertTrue(user.isEncrypted());
            assertFalse(user.getCurrentAccessPermission().canPrint());
            assertFalse(user.getCurrentAccessPermission().canExtractContent());
            assertEquals(bits, user.getEncryption().getLength());
            assertTrue(administrator.getCurrentAccessPermission().isOwnerPermission());
        }
        try (var remaining = Files.list(directory)) {
            assertEquals(0, remaining.count());
        }
    }

    @Test
    void refusesAnUnencryptedProtectionSource() throws Exception {
        byte[] plaintext = pdf(false, 256);
        assertThrows(
                IOException.class,
                () -> controller.restore(upload(plaintext), upload(plaintext), USER));
    }
}
