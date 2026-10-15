package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.SPDF.service.PdfProtectionService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.json.JsonMapper;

class PdfSessionSecurityControllerTest {
    private static final String USER = " reader password ";
    private static final String OWNER = " owner password ";
    @TempDir Path directory;
    private PdfSessionSecurityController controller;
    private CustomPDFDocumentFactory factory;
    private PdfProtectionService protectionService;

    @BeforeEach
    void setUp() throws Exception {
        factory = mock(CustomPDFDocumentFactory.class);
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
        protectionService = spy(new PdfProtectionService(JsonMapper.builder().build()));
        controller = new PdfSessionSecurityController(factory, tempFiles, protectionService);
    }

    private byte[] pdf(boolean encrypted, int bits) throws IOException {
        return pdf(encrypted, bits, true, USER, OWNER, 1);
    }

    private byte[] pdf(
            boolean encrypted, int bits, boolean aes, String user, String owner, int pages)
            throws IOException {
        try (var document = new PDDocument();
                var output = new ByteArrayOutputStream()) {
            for (int page = 0; page < pages; page++) {
                var pdfPage = new PDPage();
                pdfPage.setRotation(90);
                document.addPage(pdfPage);
            }
            if (encrypted) {
                var permissions = new AccessPermission();
                permissions.setCanPrint(false);
                permissions.setCanExtractContent(false);
                var policy = new StandardProtectionPolicy(owner, user, permissions);
                policy.setEncryptionKeyLength(bits);
                policy.setPreferAES(aes);
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
        var ownerInfo = controller.inspect(request);
        assertTrue(ownerInfo.ownerAuthenticated());
        assertEquals(info.permissions(), ownerInfo.permissions());
        assertEquals(256, ownerInfo.encryptionKeyLength());
        assertEquals(6, ownerInfo.encryptionRevision());
        request.setPassword("incorrect");
        assertThrows(InvalidPasswordException.class, () -> controller.inspect(request));
    }

    @ParameterizedTest
    @CsvSource({
        "40,false,false",
        "40,false,true",
        "128,false,false",
        "128,false,true",
        "128,true,false",
        "128,true,true",
        "256,true,false",
        "256,true,true"
    })
    void restoresBothPasswordsAndRestrictionsFromEitherCredential(
            int bits, boolean aes, boolean owner) throws Exception {
        byte[] original = pdf(true, bits, aes, USER, OWNER, 1);
        var sourceUpload = upload(original);
        var response =
                controller.restore(
                        upload(pdf(false, bits, aes, USER, OWNER, 3)),
                        sourceUpload,
                        owner ? OWNER : USER);
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
            assertEquals(3, user.getNumberOfPages());
            assertEquals(90, user.getPage(0).getRotation());
            assertTrue(administrator.getCurrentAccessPermission().isOwnerPermission());
        }
        assertArrayEquals(original, sourceUpload.getBytes());
        try (var remaining = Files.list(directory)) {
            assertEquals(0, remaining.count());
        }
    }

    @ParameterizedTest
    @CsvSource({"permissions,false", "permissions,true", "length,true", "revision,true"})
    void rejectsChangedOutputProtection(String changed, boolean owner) throws Exception {
        when(factory.load(any(InputStream.class), anyString(), eq(true)))
                .thenAnswer(
                        inv -> {
                            var document =
                                    Loader.loadPDF(
                                            inv.<InputStream>getArgument(0).readAllBytes(),
                                            inv.getArgument(1));
                            switch (changed) {
                                case "permissions" -> document.getEncryption().setPermissions(-4);
                                case "length" -> document.getEncryption().setLength(128);
                                case "revision" -> document.getEncryption().setRevision(4);
                                default -> throw new IllegalArgumentException(changed);
                            }
                            return document;
                        });
        assertThrows(
                IOException.class,
                () ->
                        controller.restore(
                                upload(pdf(false, 256)),
                                upload(pdf(true, 256)),
                                owner ? OWNER : USER));
        try (var remaining = Files.list(directory)) {
            assertEquals(0, remaining.count());
        }
    }

    @ParameterizedTest
    @CsvSource({"128,false", "128,true", "256,false", "256,true"})
    void preservesEscapedAndUnicodePasswords(int bits, boolean owner) throws Exception {
        String readerPassword = bits == 256 ? " café\"読者\" " : " reader\n\"password\" ";
        String ownerPassword = bits == 256 ? " 管理者\\\"owner\" " : " owner\\\n\"password\" ";
        var response =
                controller.restore(
                        upload(pdf(false, 256)),
                        upload(pdf(true, bits, true, readerPassword, ownerPassword, 1)),
                        owner ? ownerPassword : readerPassword);
        byte[] protectedBytes;
        try (var body = response.getBody().getInputStream()) {
            protectedBytes = body.readAllBytes();
        }
        try (var reader = Loader.loadPDF(protectedBytes, readerPassword);
                var administrator = Loader.loadPDF(protectedBytes, ownerPassword)) {
            assertFalse(reader.getCurrentAccessPermission().canExtractContent());
            assertTrue(administrator.getCurrentAccessPermission().isOwnerPermission());
        }
    }

    @Test
    void nativeFailureReturnsNoResultAndCleansTemporaryFiles() throws Exception {
        assertThrows(
                IOException.class,
                () ->
                        controller.restore(
                                upload("invalid PDF".getBytes(StandardCharsets.UTF_8)),
                                upload(pdf(true, 256)),
                                USER));
        try (var remaining = Files.list(directory)) {
            assertEquals(0, remaining.count());
        }
        var validResponse =
                controller.restore(upload(pdf(false, 256)), upload(pdf(true, 256)), USER);
        try (var body = validResponse.getBody().getInputStream();
                var document = Loader.loadPDF(body.readAllBytes(), USER)) {
            assertTrue(document.isEncrypted());
        }
    }

    @Test
    void missingNativeSupportReturnsNoResultAndCleansTemporaryFiles() throws Exception {
        doThrow(new IOException("Native PDF protection is unavailable"))
                .when(protectionService)
                .restore(any(), any(), anyString(), any());
        assertThrows(
                IOException.class,
                () -> controller.restore(upload(pdf(false, 256)), upload(pdf(true, 256)), USER));
        try (var remaining = Files.list(directory)) {
            assertEquals(0, remaining.count());
        }
    }

    @Test
    void wrongPasswordDoesNotStartNativeProcessing() throws Exception {
        assertThrows(
                InvalidPasswordException.class,
                () ->
                        controller.restore(
                                upload(pdf(false, 256)), upload(pdf(true, 256)), "incorrect"));
        verifyNoInteractions(protectionService);
    }

    @Test
    void refusesAnUnencryptedProtectionSource() throws Exception {
        byte[] plaintext = pdf(false, 256);
        assertThrows(
                IOException.class,
                () -> controller.restore(upload(plaintext), upload(plaintext), USER));
    }
}
