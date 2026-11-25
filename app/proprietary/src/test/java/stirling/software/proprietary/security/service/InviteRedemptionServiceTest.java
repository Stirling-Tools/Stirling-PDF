package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.time.LocalDateTime;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.security.model.InviteToken;
import stirling.software.proprietary.security.repository.InviteTokenRepository;

@ExtendWith(MockitoExtension.class)
class InviteRedemptionServiceTest {

    @Mock private InviteTokenRepository inviteTokenRepository;
    @Mock private UserService userService;

    private InviteRedemptionService service;
    private InviteToken invite;

    @BeforeEach
    void setUp() {
        service = new InviteRedemptionService(inviteTokenRepository, userService);
        invite = new InviteToken();
        invite.setId(7L);
        invite.setToken("tok");
        invite.setRole("ROLE_USER");
        invite.setTeamId(3L);
        invite.setExpiresAt(LocalDateTime.now().plusHours(1));
    }

    @Test
    void consumesTheTokenBeforeCreatingTheAccount() throws Exception {
        when(inviteTokenRepository.consumeIfUnused(anyLong(), any(LocalDateTime.class)))
                .thenReturn(1);

        assertTrue(service.redeem(invite, "invitee@example.com", "correct horse"));

        InOrder order = Mockito.inOrder(inviteTokenRepository, userService);
        order.verify(inviteTokenRepository).consumeIfUnused(anyLong(), any(LocalDateTime.class));
        order.verify(userService).saveUserCore(any());

        ArgumentCaptor<SaveUserRequest> saved = ArgumentCaptor.forClass(SaveUserRequest.class);
        verify(userService).saveUserCore(saved.capture());
        assertTrue("invitee@example.com".equals(saved.getValue().getUsername()));
        assertTrue(Long.valueOf(3L).equals(saved.getValue().getTeamId()));
    }

    @Test
    void createsNoAccountWhenAnotherRedemptionConsumedTheToken() throws Exception {
        when(inviteTokenRepository.consumeIfUnused(anyLong(), any(LocalDateTime.class)))
                .thenReturn(0);

        assertFalse(service.redeem(invite, "invitee@example.com", "correct horse"));

        verify(userService, never()).saveUserCore(any());
    }

    @Test
    void propagatesACreationFailureSoTheConsumptionRollsBack() throws Exception {
        when(inviteTokenRepository.consumeIfUnused(anyLong(), any(LocalDateTime.class)))
                .thenReturn(1);
        when(userService.saveUserCore(any())).thenThrow(new SQLException("boom"));

        assertThrows(SQLException.class, () -> service.redeem(invite, "invitee@example.com", "pw"));
    }
}
