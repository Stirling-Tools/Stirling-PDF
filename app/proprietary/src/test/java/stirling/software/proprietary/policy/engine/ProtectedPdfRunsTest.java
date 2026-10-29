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
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.integration.purview.protection.ProtectedPdfDetector;
import stirling.software.proprietary.integration.purview.protection.ProtectedPdfFixtures;
import stirling.software.proprietary.integration.purview.protection.ProtectionInfo;
import stirling.software.proprietary.integration.purview.protection.RightsManagementService;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

class ProtectedPdfRunsTest {

    private static final byte[] PLAINTEXT = "%PDF-1.7 decrypted".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PROTECTED_OUTPUT =
            "%PDF-2.0 protected".getBytes(StandardCharsets.UTF_8);

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
        runs = new ProtectedPdfRuns(rightsManagement, accounts, users);
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

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), true)) {
            assertThat(unlocked.hasProtectedInputs()).isFalse();
            assertThat(unlocked.inputs()).isSameAs(inputs);
        }
        verify(rightsManagement, never()).open(any(), any());
    }

    @Test
    void runsWithoutStepsNeverOpenProtectedInputs() throws IOException {
        PolicyInputs inputs = PolicyInputs.of(List.of(named(wrapper, "secret.pdf")));

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), false)) {
            assertThat(unlocked.inputs()).isSameAs(inputs);
        }
        verify(rightsManagement, never()).open(any(), any());
    }

    @Test
    void stepsSeeThePlaintextAndOutputsAreProtectedLikeTheirInput() throws IOException {
        PolicyInputs inputs =
                PolicyInputs.of(
                        List.of(
                                named(ProtectedPdfFixtures.plain(), "plain.pdf"),
                                named(wrapper, "secret.pdf")));

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), true)) {
            Resource decrypted = unlocked.inputs().primary().get(1);
            assertThat(decrypted.getFilename()).isEqualTo("secret.pdf");
            assertThat(decrypted.getContentAsByteArray()).isEqualTo(PLAINTEXT);
            assertThat(unlocked.inputs().primary().get(0)).isSameAs(inputs.primary().get(0));

            Resource plainOut = named("%PDF-1.7 a".getBytes(StandardCharsets.UTF_8), "a.pdf");
            Resource secretOut =
                    named("%PDF-1.7 b".getBytes(StandardCharsets.UTF_8), "secret_rotated.pdf");
            List<Resource> delivered =
                    unlocked.protect(
                            new PolicyExecutionResult(
                                    List.of(plainOut, secretOut),
                                    List.of(0, 1),
                                    null,
                                    null,
                                    List.of()));

            assertThat(delivered.get(0)).isSameAs(plainOut);
            assertThat(delivered.get(1).getFilename()).isEqualTo("secret_rotated.pdf");
            assertThat(delivered.get(1).getContentAsByteArray()).isEqualTo(PROTECTED_OUTPUT);
            assertThat(protectedOriginals).containsExactly(wrapper);
        }
    }

    @Test
    void decryptedCopiesAreDeletedOnClose() throws IOException {
        PolicyInputs inputs = PolicyInputs.of(List.of(named(wrapper, "secret.pdf")));
        Path decrypted;
        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), true)) {
            decrypted = unlocked.inputs().primary().getFirst().getFile().toPath();
            assertThat(decrypted).exists();
        }
        assertThat(decrypted).doesNotExist();
    }

    @Test
    void aViewOnlyAccountCannotRunStepsAndIsToldWhoToAsk() throws IOException {
        when(rightsManagement.open(eq(account), any()))
                .thenReturn(new RightsManagementService.Opened(PLAINTEXT, protection(false)));
        PolicyInputs inputs = PolicyInputs.of(List.of(named(wrapper, "secret.pdf")));

        assertThatThrownBy(() -> runs.unlock(inputs, sourceAccount(), true))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("secret.pdf")
                .hasMessageContaining("owner@contoso.com");
    }

    @Test
    void aServerWithoutRightsManagementRefusesInsteadOfProcessingTheWrapper() throws IOException {
        when(rightsManagement.available()).thenReturn(false);
        PolicyInputs inputs = PolicyInputs.of(List.of(named(wrapper, "secret.pdf")));

        assertThatThrownBy(() -> runs.unlock(inputs, sourceAccount(), true))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("not set up");
    }

    @Test
    void uploadsUseTheOwnersOnlyMicrosoftAccount() throws IOException {
        when(accounts.list(any())).thenReturn(List.of(account));
        PolicyInputs inputs = PolicyInputs.of(List.of(named(wrapper, "secret.pdf")));

        try (ProtectedPdfRuns.Unlocked unlocked =
                runs.unlock(inputs, new ProtectedPdfRuns.RunAccount(null, "pat"), true)) {
            assertThat(unlocked.hasProtectedInputs()).isTrue();
        }
        verify(rightsManagement).open(eq(account), any());
    }

    @Test
    void uploadsWithSeveralMicrosoftAccountsAreRefused() throws IOException {
        when(accounts.list(any())).thenReturn(List.of(account, microsoftAccount(34L, 7L)));
        PolicyInputs inputs = PolicyInputs.of(List.of(named(wrapper, "secret.pdf")));

        assertThatThrownBy(
                        () ->
                                runs.unlock(
                                        inputs, new ProtectedPdfRuns.RunAccount(null, "pat"), true))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("exactly one Microsoft account");
    }

    @Test
    void anotherUsersSourceAccountIsNeverUsed() throws IOException {
        when(accounts.find(33L)).thenReturn(Optional.of(microsoftAccount(33L, 99L)));
        PolicyInputs inputs = PolicyInputs.of(List.of(named(wrapper, "secret.pdf")));

        assertThatThrownBy(() -> runs.unlock(inputs, sourceAccount(), true))
                .isInstanceOf(IOException.class);
    }

    @Test
    void anExplicitAccountIsRefusedWhenTheOwnerIsUnknown() throws IOException {
        PolicyInputs inputs = PolicyInputs.of(List.of(named(wrapper, "secret.pdf")));

        for (String owner : new String[] {null, "someone-deleted"}) {
            assertThatThrownBy(
                            () ->
                                    runs.unlock(
                                            inputs,
                                            new ProtectedPdfRuns.RunAccount(33L, owner),
                                            true))
                    .isInstanceOf(IOException.class);
        }
        verify(rightsManagement, never()).open(any(), any());
    }

    @Test
    void mergingTwoProtectedInputsFailsRatherThanPickingOneProtection() throws IOException {
        PolicyInputs inputs =
                PolicyInputs.of(List.of(named(wrapper, "a.pdf"), named(wrapper, "b.pdf")));

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), true)) {
            PolicyExecutionResult merged =
                    new PolicyExecutionResult(
                            List.of(named(PLAINTEXT, "merged.pdf")),
                            Arrays.asList((Integer) null),
                            null,
                            null,
                            List.of());
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

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), true)) {
            List<Resource> delivered =
                    unlocked.protect(
                            new PolicyExecutionResult(
                                    List.of(named(PLAINTEXT, "merged.pdf")),
                                    Arrays.asList((Integer) null),
                                    null,
                                    null,
                                    List.of()));
            assertThat(delivered.getFirst().getContentAsByteArray()).isEqualTo(PROTECTED_OUTPUT);
        }
    }

    @Test
    void nonPdfOutputsOfAProtectedInputAreNeverDelivered() throws IOException {
        PolicyInputs inputs = PolicyInputs.of(List.of(named(wrapper, "secret.pdf")));

        try (ProtectedPdfRuns.Unlocked unlocked = runs.unlock(inputs, sourceAccount(), true)) {
            PolicyExecutionResult images =
                    new PolicyExecutionResult(
                            List.of(named(new byte[] {(byte) 0x89, 'P', 'N', 'G'}, "page1.png")),
                            List.of(0),
                            null,
                            null,
                            List.of());
            assertThatThrownBy(() -> unlocked.protect(images))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("page1.png");
        }
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
