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
import org.springframework.web.server.ResponseStatusException;

import stirling.software.SPDF.model.api.security.AddPasswordRequest;
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
    private CustomPDFDocumentFactory factory;

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

    private byte[] protectedPdf(String reader, String owner, int bits, AccessPermission permissions)
            throws IOException {
        try (var document = new PDDocument();
                var output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            var policy = new StandardProtectionPolicy(owner, reader, permissions);
            policy.setEncryptionKeyLength(bits);
            document.protect(policy);
            document.save(output);
            return output.toByteArray();
        }
    }

    private PDFPasswordRequest request(byte[] bytes, String password) {
        var request = new PDFPasswordRequest();
        request.setFileInput(upload(bytes));
        request.setPassword(password);
        return request;
    }

    @ParameterizedTest
    @CsvSource({"40", "128", "256"})
    void unrestrictedUserPasswordDoesNotAuthenticateTheOwner(int bits) throws Exception {
        byte[] original = protectedPdf(USER, OWNER, bits, new AccessPermission());
        assertFalse(controller.inspect(request(original, USER)).ownerAuthenticated());
        assertTrue(controller.inspect(request(original, OWNER)).ownerAuthenticated());
        assertThrows(
                ResponseStatusException.class,
                () -> controller.removeOpeningPassword(request(original, USER)));
    }

    @Test
    void unicodeOwnerCredentialsUseTheLibrarysAuthenticationResult() throws Exception {
        byte[] original = protectedPdf("reader", "秘密 café", 256, new AccessPermission());
        assertTrue(controller.inspect(request(original, "秘密 café")).ownerAuthenticated());
        assertFalse(controller.inspect(request(original, "reader")).ownerAuthenticated());
    }

    @ParameterizedTest
    @CsvSource({"128", "256"})
    void ownerOnlyDocumentsOpenWithoutGrantingOwnerAccess(int bits) throws Exception {
        var permissions = new AccessPermission();
        permissions.setCanAssembleDocument(false);
        permissions.setCanExtractContent(false);
        byte[] original = protectedPdf("", OWNER, bits, permissions);
        var info = controller.inspect(request(original, ""));
        assertTrue(info.encrypted());
        assertFalse(info.ownerAuthenticated());
        assertFalse(info.canAssemble());
        assertFalse(info.canExtract());
        assertThrows(
                ResponseStatusException.class,
                () -> controller.prepare(request(original, ""), "/api/v1/general/rotate-pdf"));
        try (var stream =
                        controller
                                .prepare(request(original, OWNER), "/api/v1/general/rotate-pdf")
                                .getBody()
                                .getInputStream();
                var working = Loader.loadPDF(stream.readAllBytes())) {
            assertFalse(working.isEncrypted());
        }
        assertTrue(controller.inspect(request(original, "")).encrypted());
    }

    @Test
    void preparationChecksTheOperationRatherThanAssemblyForEveryTool() throws Exception {
        var permissions = new AccessPermission();
        permissions.setCanExtractContent(false);
        permissions.setCanModify(false);
        byte[] original = protectedPdf(USER, OWNER, 256, permissions);
        assertThrows(
                ResponseStatusException.class,
                () -> controller.prepare(request(original, USER), "/api/v1/general/split-pages"));
        assertThrows(
                ResponseStatusException.class,
                () -> controller.prepare(request(original, USER), "/api/v1/misc/compress-pdf"));
        assertThrows(
                ResponseStatusException.class,
                () -> controller.prepare(request(original, OWNER), "/api/v1/security/auto-redact"));
        try (var stream =
                        controller
                                .prepare(request(original, USER), "/api/v1/general/rotate-pdf")
                                .getBody()
                                .getInputStream();
                var working = Loader.loadPDF(stream.readAllBytes())) {
            assertFalse(working.isEncrypted());
        }
    }

    @Test
    void removingTheOpeningPasswordRetainsKnownOwnerAccessAndStoredRestrictions() throws Exception {
        byte[] original = pdf(true, 256);
        try (var stream =
                controller
                        .removeOpeningPassword(request(original, OWNER))
                        .getBody()
                        .getInputStream()) {
            byte[] result = stream.readAllBytes();
            var viewer = controller.inspect(request(result, ""));
            assertTrue(viewer.encrypted());
            assertFalse(viewer.ownerAuthenticated());
            assertFalse(viewer.canPrint());
            assertFalse(viewer.canExtract());
            assertTrue(controller.inspect(request(result, OWNER)).ownerAuthenticated());
        }
    }

    @Test
    void removingAllProtectionRequiresOwnerAndLeavesTheOriginalIntact() throws Exception {
        byte[] original = pdf(true, 256);
        assertThrows(
                ResponseStatusException.class,
                () -> controller.removeProtection(request(original, USER)));
        try (var stream =
                        controller
                                .removeProtection(request(original, OWNER))
                                .getBody()
                                .getInputStream();
                var result = Loader.loadPDF(stream.readAllBytes())) {
            assertFalse(result.isEncrypted());
        }
        assertTrue(controller.inspect(request(original, USER)).encrypted());
    }

    @Test
    void credentialFingerprintIdentifiesStoredCredentialsRegardlessOfAuthenticationRole()
            throws Exception {
        byte[] original = pdf(true, 256);
        var reader = controller.inspect(request(original, USER));
        var owner = controller.inspect(request(original, OWNER));
        assertEquals(64, reader.credentialFingerprint().length());
        assertEquals(reader.credentialFingerprint(), owner.credentialFingerprint());
        byte[] changed = protectedPdf(USER, "different owner", 256, new AccessPermission());
        assertNotEquals(
                reader.credentialFingerprint(),
                controller.inspect(request(changed, USER)).credentialFingerprint());
    }

    @Test
    void changingProtectionRequiresSourceOwnerAndSeparateNewPasswords() throws Exception {
        var change = new AddPasswordRequest();
        change.setFileInput(upload(pdf(true, 256)));
        change.setOwnerPassword("new-owner");
        change.setPassword("new-reader");
        change.setPreventPrinting(true);
        assertThrows(ResponseStatusException.class, () -> controller.setProtection(change, USER));
        try (var stream = controller.setProtection(change, OWNER).getBody().getInputStream()) {
            byte[] result = stream.readAllBytes();
            assertFalse(controller.inspect(request(result, "new-reader")).canPrint());
            assertTrue(controller.inspect(request(result, "new-owner")).ownerAuthenticated());
            assertThrows(InvalidPasswordException.class, () -> Loader.loadPDF(result, USER));
        }
        change.setOwnerPassword("");
        assertThrows(ResponseStatusException.class, () -> controller.setProtection(change, OWNER));
        change.setOwnerPassword("new-reader");
        assertThrows(ResponseStatusException.class, () -> controller.setProtection(change, OWNER));
    }

    @Test
    void rejectsDistinctPasswordsThatBecomeEquivalentInLegacyEncryption() throws Exception {
        var change = new AddPasswordRequest();
        change.setFileInput(upload(pdf(false, 128)));
        change.setKeyLength(128);
        change.setPassword("a".repeat(32) + "reader");
        change.setOwnerPassword("a".repeat(32) + "owner");
        change.setPreventPrinting(true);
        assertThrows(ResponseStatusException.class, () -> controller.setProtection(change, ""));
        try (var remaining = Files.list(directory)) {
            assertEquals(0, remaining.count());
        }
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
    @CsvSource({"128,false", "128,true", "256,false", "256,true"})
    void restoresBothPasswordsAndRestrictionsFromEitherCredential(int bits, boolean owner)
            throws Exception {
        assumeQpdfAvailable();
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

    @ParameterizedTest
    @CsvSource({"permissions,false", "permissions,true", "length,true", "revision,true"})
    void rejectsChangedOutputProtection(String changed, boolean owner) throws Exception {
        assumeQpdfAvailable();
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

    private void assumeQpdfAvailable() throws Exception {
        boolean qpdfAvailable;
        try {
            qpdfAvailable = new ProcessBuilder("qpdf", "--version").start().waitFor() == 0;
        } catch (IOException unavailable) {
            qpdfAvailable = false;
        }
        Assumptions.assumeTrue(
                qpdfAvailable, "qpdf must be on PATH for protection integration tests");
    }

    @Test
    void refusesAnUnencryptedProtectionSource() throws Exception {
        byte[] plaintext = pdf(false, 256);
        assertThrows(
                IOException.class,
                () -> controller.restore(upload(plaintext), upload(plaintext), USER));
    }
}
