package stirling.software.proprietary.policy.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIOSource;
import stirling.software.common.model.tool.ToolIOSpec;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.integration.purview.protection.ProtectedPdfDetector;
import stirling.software.proprietary.integration.purview.protection.ProtectedPdfFixtures;
import stirling.software.proprietary.integration.purview.protection.ProtectionInfo;
import stirling.software.proprietary.integration.purview.protection.RightsManagementService;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

class ProtectedPdfRunsTest {

    private static final byte[] PLAINTEXT = "%PDF-1.7 decrypted".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PROTECTED_OUTPUT =
            "%PDF-2.0 protected".getBytes(StandardCharsets.UTF_8);
    private static final String ROTATE_PDF = "/api/v1/general/rotate-pdf";
    private static final String REMOVE_PASSWORD = "/api/v1/security/remove-password";
    private static final String ANY_FILE_STEP = "/api/v1/misc/any-file-step";
    private static final List<PipelineStep> ROTATE =
            List.of(new PipelineStep(ROTATE_PDF, Map.of()));
    private static final ToolIOSource TOOL_IO =
            ToolIOSource.of(
                    Map.of(
                            ROTATE_PDF,
                            new ToolIOSpec(
                                    Set.of(ToolFormat.PDF),
                                    ToolFormat.PDF,
                                    ToolArity.SISO,
                                    List.of()),
                            REMOVE_PASSWORD,
                            new ToolIOSpec(
                                    Set.of(ToolFormat.PDF, ToolFormat.PDF_ENCRYPTED),
                                    ToolFormat.PDF,
                                    ToolArity.SISO,
                                    List.of()),
                            ANY_FILE_STEP,
                            new ToolIOSpec(
                                    Set.of(ToolFormat.ANY),
                                    ToolFormat.ANY,
                                    ToolArity.SISO,
                                    List.of())));

    private RightsManagementService rightsManagement;
    private ConnectedAccountService accounts;
    private UserRepository users;
    private ProtectedPdfRuns runs;
    private ConnectedAccount account;
    private byte[] wrapper;
    private final List<byte[]> protectedOriginals = new ArrayList<>();

    @BeforeEach
    void setUp() throws IOException {
        rightsManagement = mock(RightsManagementService.class);
        accounts = mock(ConnectedAccountService.class);
        users = mock(UserRepository.class);
        runs = new ProtectedPdfRuns(rightsManagement, accounts, users, TOOL_IO);
        account = microsoftAccount(33L, 7L);
        wrapper = ProtectedPdfFixtures.wrapper(ProtectedPdfDetector.MICROSOFT_SUBTYPE, true, true);

        User owner = mock(User.class);
        when(owner.getId()).thenReturn(7L);
        when(users.findByUsernameIgnoreCase("pat")).thenReturn(Optional.of(owner));
        when(users.findById(7L)).thenReturn(Optional.of(owner));
        when(accounts.find(33L)).thenReturn(Optional.of(account));
        when(rightsManagement.available()).thenReturn(true);
        when(rightsManagement.open(eq(account), any()))
                .thenReturn(new RightsManagementService.Opened(PLAINTEXT, protection(true)));
        when(rightsManagement.protectLike(eq(account), any(), any()))
                .thenAnswer(
                        invocation -> {
                            Path original = invocation.getArgument(1);
                            protectedOriginals.add(Files.readAllBytes(original));
                            return PROTECTED_OUTPUT;
                        });
    }

    @Test
    void plainInputsPassThroughWithoutTouchingRightsManagement() throws IOException {
        PolicyInputs inputs =
                PolicyInputs.of(List.of(named(ProtectedPdfFixtures.plain(), "a.pdf")));

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), ROTATE)) {
            assertThat(unlocked.hasProtectedInputs()).isFalse();
            assertThat(unlocked.inputs()).isSameAs(inputs);
        }
        verify(rightsManagement, never()).open(any(), any());
    }

    @Test
    void runsWithoutStepsNeverOpenProtectedInputs() throws IOException {
        PolicyInputs inputs = protectedInput();

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), List.of())) {
            assertThat(unlocked.inputs()).isSameAs(inputs);
        }
        verify(rightsManagement, never()).open(any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "reader"})
    void aPasswordProtectedPdfIsRefusedBeforeAStepThatWouldDropItsProtection(String openingPassword)
            throws IOException {
        PolicyInputs inputs = passwordProtectedInput(openingPassword);

        assertThatThrownBy(() -> runs.unlock(inputs, sourceAccount(), ROTATE))
                .isInstanceOfSatisfying(
                        ExceptionUtils.PdfPasswordException.class,
                        e ->
                                assertThat(e.getErrorCode())
                                        .isEqualTo(ExceptionUtils.ErrorCode.PDF_PASSWORD.getCode()))
                .hasMessageContaining("password-protected")
                .hasMessageNotContaining("locked.pdf");
        verify(rightsManagement, never()).open(any(), any());
    }

    @Test
    void aStepThatTakesEncryptedPdfsStillReceivesAPasswordProtectedOne() throws IOException {
        PolicyInputs inputs = passwordProtectedInput("");
        List<PipelineStep> removePassword =
                List.of(
                        new PipelineStep(
                                REMOVE_PASSWORD, Map.of("password", "permissions-secret")));

        try (ProtectedPdfRuns.Unlocked unlocked =
                runs.unlock(inputs, sourceAccount(), removePassword)) {
            assertThat(unlocked.inputs()).isSameAs(inputs);
        }
    }

    @Test
    void aStepThatTakesAnyFileCannotDeliverAPasswordProtectedPdfWithoutItsPassword()
            throws IOException {
        PolicyInputs inputs = passwordProtectedInput("");
        List<PipelineStep> anyFile = List.of(new PipelineStep(ANY_FILE_STEP, Map.of()));

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), anyFile)) {
            PolicyExecutionResult stripped =
                    result(List.of(named(ProtectedPdfFixtures.plain(), "locked.pdf")), 0);
            assertThatThrownBy(() -> unlocked.protect(stripped))
                    .isInstanceOf(ExceptionUtils.PdfPasswordException.class)
                    .hasMessageContaining("no longer password-protected");
            PolicyExecutionResult kept =
                    result(
                            List.of(
                                    named(
                                            ProtectedPdfFixtures.passwordProtected(""),
                                            "locked.pdf")),
                            0);
            assertThat(unlocked.protect(kept)).isEqualTo(kept.files());
        }
    }

    @Test
    void removingThePasswordMayDeliverAnUnprotectedPdf() throws IOException {
        PolicyInputs inputs = passwordProtectedInput("");
        List<PipelineStep> removePassword =
                List.of(
                        new PipelineStep(
                                REMOVE_PASSWORD, Map.of("password", "permissions-secret")));

        try (ProtectedPdfRuns.Unlocked unlocked =
                runs.unlock(inputs, sourceAccount(), removePassword)) {
            PolicyExecutionResult unprotected =
                    result(List.of(named(ProtectedPdfFixtures.plain(), "locked.pdf")), 0);
            assertThat(unlocked.protect(unprotected)).isEqualTo(unprotected.files());
        }
    }

    @Test
    void aRunMixingPurviewAndPasswordProtectedInputsIsRefused() throws IOException {
        PolicyInputs inputs =
                PolicyInputs.of(
                        List.of(
                                named(wrapper, "secret.pdf"),
                                named(ProtectedPdfFixtures.passwordProtected(""), "locked.pdf")));
        List<PipelineStep> anyFile = List.of(new PipelineStep(ANY_FILE_STEP, Map.of()));

        assertThatThrownBy(() -> runs.unlock(inputs, sourceAccount(), anyFile))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("password-protected");
        verify(rightsManagement, never()).open(any(), any());
    }

    @Test
    void runsWithoutStepsDeliverAPasswordProtectedPdfAsItIs() throws IOException {
        PolicyInputs inputs = passwordProtectedInput("");

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), List.of())) {
            assertThat(unlocked.inputs()).isSameAs(inputs);
        }
    }

    @Test
    void stepsSeeThePlaintextAndOutputsAreProtectedLikeTheirInput() throws IOException {
        PolicyInputs inputs =
                PolicyInputs.of(
                        List.of(
                                named(ProtectedPdfFixtures.plain(), "plain.pdf"),
                                named(wrapper, "secret.pdf")));

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), ROTATE)) {
            Resource decrypted = unlocked.inputs().primary().get(1);
            assertThat(decrypted.getFilename()).isEqualTo("secret.pdf");
            assertThat(decrypted.getContentAsByteArray()).isEqualTo(PLAINTEXT);
            assertThat(unlocked.inputs().primary().get(0)).isSameAs(inputs.primary().get(0));

            Resource plainOut = named("%PDF-1.7 a".getBytes(StandardCharsets.UTF_8), "a.pdf");
            Resource secretOut =
                    named("%PDF-1.7 b".getBytes(StandardCharsets.UTF_8), "secret_rotated.pdf");
            List<Resource> delivered = unlocked.protect(result(List.of(plainOut, secretOut), 0, 1));

            assertThat(delivered.get(0)).isSameAs(plainOut);
            assertThat(delivered.get(1).getFilename()).isEqualTo("secret_rotated.pdf");
            assertThat(delivered.get(1).getContentAsByteArray()).isEqualTo(PROTECTED_OUTPUT);
            assertThat(protectedOriginals).containsExactly(wrapper);
        }
    }

    @Test
    void decryptedCopiesAreDeletedOnClose() throws IOException {
        PolicyInputs inputs = protectedInput();
        Path decrypted;
        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), ROTATE)) {
            decrypted = unlocked.inputs().primary().getFirst().getFile().toPath();
            assertThat(decrypted).exists();
        }
        assertThat(decrypted).doesNotExist();
    }

    @Test
    void aViewOnlyAccountCannotRunStepsAndIsToldWhoToAsk() throws IOException {
        when(rightsManagement.open(eq(account), any()))
                .thenReturn(new RightsManagementService.Opened(PLAINTEXT, protection(false)));
        PolicyInputs inputs = protectedInput();

        assertThatThrownBy(() -> runs.unlock(inputs, sourceAccount(), ROTATE))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("secret.pdf")
                .hasMessageContaining("owner@contoso.com");
    }

    @Test
    void aServerWithoutRightsManagementRefusesInsteadOfProcessingTheWrapper() throws IOException {
        when(rightsManagement.available()).thenReturn(false);
        PolicyInputs inputs = protectedInput();

        assertThatThrownBy(() -> runs.unlock(inputs, sourceAccount(), ROTATE))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("not set up");
    }

    @Test
    void uploadsUseTheOwnersOnlyMicrosoftAccount() throws IOException {
        when(accounts.list(any())).thenReturn(List.of(account));
        PolicyInputs inputs = protectedInput();

        try (ProtectedPdfRuns.Unlocked unlocked =
                runs.unlock(inputs, new ProtectedPdfRuns.RunAccount(null, "pat"), ROTATE)) {
            assertThat(unlocked.hasProtectedInputs()).isTrue();
        }
        verify(rightsManagement).open(eq(account), any());
    }

    @Test
    void uploadsWithSeveralMicrosoftAccountsAreRefused() throws IOException {
        when(accounts.list(any())).thenReturn(List.of(account, microsoftAccount(34L, 7L)));
        PolicyInputs inputs = protectedInput();

        assertThatThrownBy(
                        () ->
                                runs.unlock(
                                        inputs,
                                        new ProtectedPdfRuns.RunAccount(null, "pat"),
                                        ROTATE))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("exactly one Microsoft account");
    }

    @Test
    void anotherUsersSourceAccountIsNeverUsed() throws IOException {
        when(accounts.find(33L)).thenReturn(Optional.of(microsoftAccount(33L, 99L)));
        PolicyInputs inputs = protectedInput();

        assertThatThrownBy(() -> runs.unlock(inputs, sourceAccount(), ROTATE))
                .isInstanceOf(IOException.class);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = "someone-deleted")
    void anExplicitAccountIsRefusedWhenTheOwnerIsUnknown(String owner) throws IOException {
        PolicyInputs inputs = protectedInput();

        assertThatThrownBy(
                        () ->
                                runs.unlock(
                                        inputs,
                                        new ProtectedPdfRuns.RunAccount(33L, owner),
                                        ROTATE))
                .isInstanceOf(IOException.class);
        verify(rightsManagement, never()).open(any(), any());
    }

    @Test
    void mergingTwoProtectedInputsFailsRatherThanPickingOneProtection() throws IOException {
        PolicyInputs inputs =
                PolicyInputs.of(List.of(named(wrapper, "a.pdf"), named(wrapper, "b.pdf")));

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), ROTATE)) {
            PolicyExecutionResult merged =
                    result(List.of(named(PLAINTEXT, "merged.pdf")), (Integer) null);
            assertThatThrownBy(() -> unlocked.protect(merged))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("merged.pdf");
        }
    }

    @Test
    void aMergeWithOneProtectedInputCarriesThatProtection() throws IOException {
        PolicyInputs inputs =
                PolicyInputs.of(
                        List.of(
                                named(ProtectedPdfFixtures.plain(), "a.pdf"),
                                named(wrapper, "b.pdf")));

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), ROTATE)) {
            List<Resource> delivered =
                    unlocked.protect(
                            result(List.of(named(PLAINTEXT, "merged.pdf")), (Integer) null));
            assertThat(delivered.getFirst().getContentAsByteArray()).isEqualTo(PROTECTED_OUTPUT);
        }
    }

    @Test
    void nonPdfOutputsOfAProtectedInputAreNeverDelivered() throws IOException {
        PolicyInputs inputs = protectedInput();

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), ROTATE)) {
            PolicyExecutionResult images =
                    result(List.of(named(new byte[] {(byte) 0x89, 'P', 'N', 'G'}, "page1.png")), 0);
            assertThatThrownBy(() -> unlocked.protect(images))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("page1.png");
        }
    }

    private PolicyInputs protectedInput() {
        return PolicyInputs.of(List.of(named(wrapper, "secret.pdf")));
    }

    private static PolicyInputs passwordProtectedInput(String openingPassword) throws IOException {
        return PolicyInputs.of(
                List.of(
                        named(
                                ProtectedPdfFixtures.passwordProtected(openingPassword),
                                "locked.pdf")));
    }

    private static PolicyExecutionResult result(List<Resource> files, Integer... origins) {
        return new PolicyExecutionResult(files, Arrays.asList(origins), null, null, List.of());
    }

    private static ProtectedPdfRuns.RunAccount sourceAccount() {
        return new ProtectedPdfRuns.RunAccount(33L, "pat");
    }

    private static ConnectedAccount microsoftAccount(long id, long ownerId) {
        ConnectedAccount account = new ConnectedAccount();
        account.setId(id);
        account.setOwnerUserId(ownerId);
        account.setProvider(CloudProvider.MICROSOFT.id());
        return account;
    }

    private static ProtectionInfo protection(boolean edit) {
        return new ProtectionInfo(
                null,
                List.of(edit ? "EDIT" : "VIEW"),
                "owner@contoso.com",
                "pat@contoso.com",
                false,
                "content",
                true,
                null,
                null,
                true,
                null,
                new ProtectionInfo.Permissions(true, false, false, edit, false, false, false));
    }

    private static Resource named(byte[] bytes, String name) {
        return new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }
}
