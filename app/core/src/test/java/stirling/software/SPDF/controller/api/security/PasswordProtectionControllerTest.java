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
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.SPDF.model.api.security.AddPasswordRequest;
import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.SPDF.model.api.security.RemovePasswordRequest;
import stirling.software.SPDF.service.PdfPasswordRoles;
import stirling.software.SPDF.service.PdfSessionPermissions;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.jpdfium.doc.PdfSecurity;
import stirling.software.jpdfium.exception.JPDFiumException;

class PasswordProtectionControllerTest {
    private static final String USER = " reader password ";
    private static final String OWNER = " owner password ";
    @TempDir Path directory;
    private PasswordController controller;
    private CustomPDFDocumentFactory factory;
    private ApplicationProperties properties;

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
        when(factory.load(any(MultipartFile.class), anyString()))
                .thenAnswer(
                        inv ->
                                Loader.loadPDF(
                                        inv.<MultipartFile>getArgument(0).getBytes(),
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
        properties = new ApplicationProperties();
        controller = new PasswordController(factory, tempFiles, properties);
    }

    private ResponseEntity<Resource> changePermissions(AddPasswordRequest request, String password)
            throws IOException {
        request.setSourcePassword(password);
        request.setPreserveExisting(true);
        return controller.addPassword(request);
    }

    private ResponseEntity<Resource> setProtection(AddPasswordRequest request, String password)
            throws IOException {
        request.setSourcePassword(password);
        request.setPreserveExisting(false);
        return controller.addPassword(request);
    }

    private ResponseEntity<Resource> removeProtection(PDFPasswordRequest input) throws IOException {
        var request = new RemovePasswordRequest();
        request.setFileInput(input.getFileInput());
        request.setPassword(input.getPassword());
        request.setRemoveAll(true);
        return controller.removePassword(request);
    }

    private ResponseEntity<Resource> removePasswords(
            PDFPasswordRequest input,
            String ownerPassword,
            String sourcePassword,
            String retainedOpeningPassword)
            throws IOException {
        var request = new RemovePasswordRequest();
        request.setFileInput(input.getFileInput());
        request.setPassword(input.getPassword());
        request.setOwnerPassword(ownerPassword);
        request.setSourcePassword(sourcePassword);
        request.setRetainedOpeningPassword(retainedOpeningPassword);
        return controller.removePassword(request);
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

    @Test
    void legacyAddPasswordRequiresOwnerForRestrictedSources() throws Exception {
        var request = new AddPasswordRequest();
        request.setFileInput(upload(pdf(true, 256, true, "", OWNER, 1)));
        request.setPassword("replacement-reader");
        request.setOwnerPassword("replacement-owner");
        request.setKeyLength(256);

        var denied =
                assertThrows(ResponseStatusException.class, () -> controller.addPassword(request));
        assertEquals(403, denied.getStatusCode().value());

        request.setSourcePassword("incorrect");
        assertThrows(InvalidPasswordException.class, () -> controller.addPassword(request));

        request.setSourcePassword(OWNER);
        try (var body = controller.addPassword(request).getBody().getInputStream();
                var output = Loader.loadPDF(body.readAllBytes(), "replacement-reader")) {
            assertTrue(output.isEncrypted());
            assertTrue(output.getCurrentAccessPermission().canExtractContent());
        }
    }

    @Test
    void legacyAddPasswordRespectsDisabledOwnerPolicy() throws Exception {
        properties.getSecurity().setHonorOwnerPasswords(false);
        var request = new AddPasswordRequest();
        request.setFileInput(upload(pdf(true, 256, true, "", OWNER, 1)));
        request.setPassword("replacement-reader");
        request.setOwnerPassword("replacement-owner");
        request.setKeyLength(256);

        try (var body = controller.addPassword(request).getBody().getInputStream();
                var output = Loader.loadPDF(body.readAllBytes(), "replacement-reader")) {
            assertTrue(output.isEncrypted());
            assertTrue(output.getCurrentAccessPermission().canExtractContent());
        }
    }

    @Test
    void honorsOwnerPasswordsByDefaultAndAllowsConfiguredBypass() throws Exception {
        var original = pdf(true, 256);
        assertTrue(properties.getSecurity().isHonorOwnerPasswords());
        assertThrows(
                ResponseStatusException.class, () -> removeProtection(request(original, USER)));
        properties.getSecurity().setHonorOwnerPasswords(false);
        try (var stream = removeProtection(request(original, USER)).getBody().getInputStream();
                var output = Loader.loadPDF(stream.readAllBytes())) {
            assertFalse(output.isEncrypted());
        }
        assertFalse(inspect(request(original, USER)).ownerAuthenticated());
    }

    @ParameterizedTest
    @CsvSource({"40", "128", "256"})
    void bypassesRestrictionsButStillRequiresOpeningPassword(int bits) throws Exception {
        properties.getSecurity().setHonorOwnerPasswords(false);
        var original = pdf(true, bits);
        assertThrows(InvalidPasswordException.class, () -> inspect(request(original, "")));
        assertThrows(
                InvalidPasswordException.class,
                () ->
                        controller.prepare(
                                request(original, "wrong"), "/api/v1/general/split-pages"));
        assertThrows(
                stirling.software.common.util.ExceptionUtils.PdfPasswordException.class,
                () -> removeProtection(request(original, "")));
        try (var stream =
                        controller
                                .prepare(request(original, USER), "/api/v1/general/split-pages")
                                .getBody()
                                .getInputStream();
                var working = Loader.loadPDF(stream.readAllBytes())) {
            assertFalse(working.isEncrypted());
        }
        try (var stream = removeProtection(request(original, USER)).getBody().getInputStream();
                var copy = Loader.loadPDF(stream.readAllBytes())) {
            assertFalse(copy.isEncrypted());
        }
        assertTrue(inspect(request(original, USER)).encrypted());
    }

    @Test
    void bypassRetainsUnknownOwnerUnlessAReplacementIsExplicit() throws Exception {
        properties.getSecurity().setHonorOwnerPasswords(false);
        var original = pdf(true, 256);
        var update = new AddPasswordRequest();
        update.setFileInput(upload(original));
        update.setPassword(USER);
        update.setPreventModify(true);
        try (var stream = changePermissions(update, USER).getBody().getInputStream()) {
            byte[] bytes = stream.readAllBytes();
            assertFalse(inspect(request(bytes, USER)).ownerAuthenticated());
            assertTrue(inspect(request(bytes, OWNER)).ownerAuthenticated());
        }
        update.setOwnerPassword("replacement-owner");
        try (var stream = changePermissions(update, USER).getBody().getInputStream()) {
            byte[] bytes = stream.readAllBytes();
            assertFalse(inspect(request(bytes, USER)).canModify());
            assertFalse(inspect(request(bytes, USER)).ownerAuthenticated());
            assertTrue(inspect(request(bytes, "replacement-owner")).ownerAuthenticated());
        }
    }

    private record Protection(
            boolean encrypted,
            boolean ownerAuthenticated,
            boolean canModify,
            boolean canAssemble,
            boolean canExtract,
            boolean canPrint,
            boolean requiresOpeningPassword,
            boolean hasOwnerPassword) {}

    private Protection inspect(PDFPasswordRequest request) throws IOException {
        String password = request.getPassword() == null ? "" : request.getPassword();
        try (var document = Loader.loadPDF(request.getFileInput().getBytes(), password)) {
            var permission = document.getCurrentAccessPermission();
            return new Protection(
                    document.isEncrypted(),
                    PdfSessionPermissions.isOwnerAuthenticated(document),
                    permission.canModify(),
                    permission.canAssembleDocument(),
                    permission.canExtractContent(),
                    permission.canPrint(),
                    document.isEncrypted() && !PdfPasswordRoles.isOpeningPassword(document, ""),
                    PdfPasswordRoles.hasSeparateOwnerPassword(document, password));
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
            document.getDocumentInformation().setTitle("Protected content");
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

    @Test
    void changingPermissionsRetainsTheVerifiedOwnerForAnOwnerOnlyPdf() throws Exception {
        var update = new AddPasswordRequest();
        update.setFileInput(upload(protectedPdf("", OWNER, 256, new AccessPermission())));
        update.setPreventModify(true);
        try (var stream = changePermissions(update, OWNER).getBody().getInputStream()) {
            var bytes = stream.readAllBytes();
            var reader = inspect(request(bytes, ""));
            assertTrue(reader.encrypted());
            assertFalse(reader.canModify());
            assertFalse(reader.requiresOpeningPassword());
            assertTrue(inspect(request(bytes, OWNER)).ownerAuthenticated());
        }
    }

    @ParameterizedTest
    @CsvSource({"40", "128", "256"})
    void changingPermissionsCannotSilentlyRemoveAnOpeningPassword(int bits) throws Exception {
        var update = new AddPasswordRequest();
        update.setFileInput(upload(pdf(true, bits)));
        update.setPreventModify(true);
        update.setPassword("must-not-replace-the-opening-password");
        assertThrows(ResponseStatusException.class, () -> changePermissions(update, USER));
        try (var stream = changePermissions(update, OWNER).getBody().getInputStream()) {
            var bytes = stream.readAllBytes();
            assertThrows(InvalidPasswordException.class, () -> Loader.loadPDF(bytes));
            try (var output = Loader.loadPDF(bytes, USER)) {
                assertEquals(
                        bits == 40 ? 1 : bits == 128 ? 4 : 5, output.getEncryption().getVersion());
                assertEquals(bits, output.getEncryption().getLength());
            }
            assertFalse(inspect(request(bytes, USER)).canModify());
            assertTrue(inspect(request(bytes, OWNER)).ownerAuthenticated());
        }
    }

    @ParameterizedTest
    @CsvSource({"40,true", "128,true", "256,true", "40,false", "128,false", "256,false"})
    void blankRemovalFieldsKeepTheirPasswordsRegardlessOfCachedCredentials(int bits, boolean honor)
            throws Exception {
        properties.getSecurity().setHonorOwnerPasswords(honor);
        byte[] original = pdf(true, bits);
        assertThrows(
                ResponseStatusException.class,
                () -> removePasswords(request(original, ""), "", OWNER, USER));
        try (var stream =
                removePasswords(request(original, USER), "", OWNER, USER)
                        .getBody()
                        .getInputStream()) {
            byte[] result = stream.readAllBytes();
            var reader = inspect(request(result, ""));
            assertFalse(reader.requiresOpeningPassword());
            assertTrue(reader.hasOwnerPassword());
            assertFalse(reader.ownerAuthenticated());
            assertFalse(reader.canPrint());
            assertTrue(inspect(request(result, OWNER)).ownerAuthenticated());
        }
        try (var stream =
                removePasswords(request(original, ""), OWNER, USER, USER)
                        .getBody()
                        .getInputStream()) {
            byte[] result = stream.readAllBytes();
            assertThrows(InvalidPasswordException.class, () -> Loader.loadPDF(result));
            assertThrows(InvalidPasswordException.class, () -> Loader.loadPDF(result, OWNER));
            var reader = inspect(request(result, USER));
            assertTrue(reader.requiresOpeningPassword());
            assertFalse(reader.hasOwnerPassword());
            assertTrue(reader.canPrint());
        }
        try (var stream =
                        removePasswords(request(original, USER), OWNER, USER, USER)
                                .getBody()
                                .getInputStream();
                var result = Loader.loadPDF(stream.readAllBytes())) {
            assertFalse(result.isEncrypted());
        }
        assertTrue(inspect(request(original, USER)).requiresOpeningPassword());
        assertTrue(inspect(request(original, OWNER)).hasOwnerPassword());
    }

    @ParameterizedTest
    @CsvSource({"true", "false"})
    void removalValidatesEachSelectedRoleAndNeverReplacesAnUnknownPassword(boolean honor)
            throws Exception {
        properties.getSecurity().setHonorOwnerPasswords(honor);
        byte[] original = pdf(true, 256);
        assertThrows(
                ResponseStatusException.class,
                () -> removePasswords(request(original, OWNER), OWNER, USER, USER));
        assertThrows(
                ResponseStatusException.class,
                () -> removePasswords(request(original, USER), USER, USER, USER));
        assertThrows(
                ResponseStatusException.class,
                () -> removePasswords(request(original, USER), "", USER, USER));
        assertThrows(
                ResponseStatusException.class,
                () -> removePasswords(request(original, ""), OWNER, OWNER, ""));
        assertThrows(
                ResponseStatusException.class,
                () -> removePasswords(request(original, "wrong"), OWNER, USER, USER));
    }

    @ParameterizedTest
    @CsvSource({"40", "128", "256"})
    void removalSupportsFilesWithOnlyOnePassword(int bits) throws Exception {
        byte[] openingOnly = protectedPdf(USER, "", bits, new AccessPermission());
        try (var stream =
                        removePasswords(request(openingOnly, USER), "", USER, USER)
                                .getBody()
                                .getInputStream();
                var result = Loader.loadPDF(stream.readAllBytes())) {
            assertFalse(result.isEncrypted());
        }
        byte[] ownerOnly = protectedPdf("", OWNER, bits, new AccessPermission());
        try (var stream =
                        removePasswords(request(ownerOnly, ""), OWNER, "", "")
                                .getBody()
                                .getInputStream();
                var result = Loader.loadPDF(stream.readAllBytes())) {
            assertFalse(result.isEncrypted());
        }
    }

    @ParameterizedTest
    @CsvSource({"40", "128", "256"})
    void changingOnlyPermissionsRetainsUnknownPasswordsAndEncryptedContent(int bits)
            throws Exception {
        properties.getSecurity().setHonorOwnerPasswords(false);
        var permissions = new AccessPermission();
        permissions.setCanPrint(false);
        byte[] original = protectedPdf(USER, OWNER, bits, permissions);
        var update = new AddPasswordRequest();
        update.setFileInput(upload(original));
        update.setPreventModify(true);
        for (String credential : new String[] {USER, OWNER}) {
            try (var stream = changePermissions(update, credential).getBody().getInputStream()) {
                byte[] result = stream.readAllBytes();
                try (var reader = Loader.loadPDF(result, USER);
                        var owner = Loader.loadPDF(result, OWNER)) {
                    assertEquals("Protected content", reader.getDocumentInformation().getTitle());
                    assertEquals("Protected content", owner.getDocumentInformation().getTitle());
                    assertFalse(reader.getCurrentAccessPermission().canModify());
                    assertTrue(reader.getCurrentAccessPermission().canPrint());
                }
                assertFalse(inspect(request(result, USER)).ownerAuthenticated());
                assertTrue(inspect(request(result, OWNER)).ownerAuthenticated());
            }
        }
    }

    @ParameterizedTest
    @CsvSource({"40", "128", "256"})
    void unrestrictedUserPasswordDoesNotAuthenticateTheOwner(int bits) throws Exception {
        byte[] original = protectedPdf(USER, OWNER, bits, new AccessPermission());
        assertFalse(inspect(request(original, USER)).ownerAuthenticated());
        assertTrue(inspect(request(original, OWNER)).ownerAuthenticated());
        assertThrows(
                ResponseStatusException.class,
                () -> removePasswords(request(original, USER), "", USER, ""));
    }

    @ParameterizedTest
    @CsvSource({"128", "256"})
    void ownerOnlyDocumentsOpenWithoutGrantingOwnerAccess(int bits) throws Exception {
        var permissions = new AccessPermission();
        permissions.setCanAssembleDocument(false);
        permissions.setCanExtractContent(false);
        byte[] original = protectedPdf("", OWNER, bits, permissions);
        var info = inspect(request(original, ""));
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
        assertTrue(inspect(request(original, "")).encrypted());
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
    void removingAllProtectionRequiresOwnerAndLeavesTheOriginalIntact() throws Exception {
        byte[] original = pdf(true, 256);
        assertThrows(
                ResponseStatusException.class, () -> removeProtection(request(original, USER)));
        try (var stream = removeProtection(request(original, OWNER)).getBody().getInputStream();
                var result = Loader.loadPDF(stream.readAllBytes())) {
            assertFalse(result.isEncrypted());
        }
        assertTrue(inspect(request(original, USER)).encrypted());
    }

    @Test
    void changingProtectionRequiresSourceOwnerAndSeparateNewPasswords() throws Exception {
        var change = new AddPasswordRequest();
        change.setFileInput(upload(pdf(true, 256)));
        change.setOwnerPassword("new-owner");
        change.setPassword("new-reader");
        change.setPreventPrinting(true);
        assertThrows(ResponseStatusException.class, () -> setProtection(change, USER));
        try (var stream = setProtection(change, OWNER).getBody().getInputStream()) {
            byte[] result = stream.readAllBytes();
            assertFalse(inspect(request(result, "new-reader")).canPrint());
            assertTrue(inspect(request(result, "new-owner")).ownerAuthenticated());
            assertThrows(InvalidPasswordException.class, () -> Loader.loadPDF(result, USER));
        }
        change.setOwnerPassword("");
        assertThrows(ResponseStatusException.class, () -> setProtection(change, OWNER));
        change.setOwnerPassword("new-reader");
        assertThrows(ResponseStatusException.class, () -> setProtection(change, OWNER));
    }

    @Test
    void rejectsDistinctPasswordsThatBecomeEquivalentInLegacyEncryption() throws Exception {
        var change = new AddPasswordRequest();
        change.setFileInput(upload(pdf(false, 128)));
        change.setKeyLength(128);
        change.setPassword("a".repeat(32) + "reader");
        change.setOwnerPassword("a".repeat(32) + "owner");
        change.setPreventPrinting(true);
        assertThrows(ResponseStatusException.class, () -> setProtection(change, ""));
        try (var remaining = Files.list(directory)) {
            assertEquals(0, remaining.count());
        }
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
        try (var security = mockStatic(PdfSecurity.class)) {
            security.when(() -> PdfSecurity.copyEncryption(any(), any(), any(), anyString()))
                    .thenThrow(new JPDFiumException("Native PDF protection is unavailable"));
            assertThrows(
                    IOException.class,
                    () ->
                            controller.restore(
                                    upload(pdf(false, 256)), upload(pdf(true, 256)), USER));
        }
        try (var remaining = Files.list(directory)) {
            assertEquals(0, remaining.count());
        }
    }

    @Test
    void wrongPasswordDoesNotStartNativeProcessing() throws Exception {
        try (var security = mockStatic(PdfSecurity.class)) {
            assertThrows(
                    InvalidPasswordException.class,
                    () ->
                            controller.restore(
                                    upload(pdf(false, 256)), upload(pdf(true, 256)), "incorrect"));
            security.verifyNoInteractions();
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
