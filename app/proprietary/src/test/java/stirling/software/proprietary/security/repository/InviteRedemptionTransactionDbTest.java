package stirling.software.proprietary.security.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import stirling.software.proprietary.security.model.InviteToken;
import stirling.software.proprietary.security.service.InviteRedemptionService;
import stirling.software.proprietary.security.service.UserService;

@DataJpaTest
@ContextConfiguration(classes = InviteTokenRepositoryDbTest.TestApp.class)
@Import(InviteRedemptionService.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class InviteRedemptionTransactionDbTest {

    @Autowired private InviteTokenRepository repository;
    @Autowired private InviteRedemptionService redemptionService;
    @MockitoBean private UserService userService;

    @Test
    void checkedCreationFailureRollsBackConsumptionAndAllowsRetry() throws Exception {
        InviteToken invite = storedInvite();
        when(userService.saveUserCore(any()))
                .thenAnswer(
                        invocation -> {
                            assertThat(
                                            TransactionSynchronizationManager
                                                    .isActualTransactionActive())
                                    .isTrue();
                            assertThat(repository.findById(invite.getId()).orElseThrow().isUsed())
                                    .isTrue();
                            throw new SQLException("Account creation failed");
                        });

        assertThrows(
                SQLException.class,
                () -> redemptionService.redeem(invite, "invitee@example.com", "password"));

        InviteToken reloaded = repository.findById(invite.getId()).orElseThrow();
        assertThat(reloaded.isUsed()).isFalse();
        assertThat(reloaded.getUsedAt()).isNull();

        doReturn(null).when(userService).saveUserCore(any());
        assertThat(redemptionService.redeem(reloaded, "invitee@example.com", "password")).isTrue();
        assertThat(repository.findById(invite.getId()).orElseThrow().isUsed()).isTrue();
        assertThat(redemptionService.redeem(reloaded, "second@example.com", "password")).isFalse();
    }

    @Test
    void uncheckedCreationFailureAlsoReleasesTheInvite() throws Exception {
        InviteToken invite = storedInvite();
        when(userService.saveUserCore(any()))
                .thenThrow(new IllegalStateException("Creation failed"));

        assertThrows(
                IllegalStateException.class,
                () -> redemptionService.redeem(invite, "invitee@example.com", "password"));

        InviteToken reloaded = repository.findById(invite.getId()).orElseThrow();
        assertThat(reloaded.isUsed()).isFalse();
        assertThat(reloaded.getUsedAt()).isNull();
    }

    private InviteToken storedInvite() {
        InviteToken invite = new InviteToken();
        invite.setToken(UUID.randomUUID().toString());
        invite.setEmail("invitee@example.com");
        invite.setRole("ROLE_USER");
        invite.setExpiresAt(LocalDateTime.now().plusHours(24));
        invite.setCreatedBy("admin");
        return repository.saveAndFlush(invite);
    }
}
