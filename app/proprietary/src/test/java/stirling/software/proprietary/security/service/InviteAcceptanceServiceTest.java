package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.LockModeType;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.model.InviteToken;
import stirling.software.proprietary.security.repository.InviteTokenRepository;
import stirling.software.proprietary.security.service.InviteAcceptanceService.AcceptanceResult;
import stirling.software.proprietary.security.service.InviteAcceptanceService.InviteAcceptanceException;

@ExtendWith(MockitoExtension.class)
class InviteAcceptanceServiceTest {

    @Mock private InviteTokenRepository inviteTokenRepository;
    @Mock private UserService userService;
    @InjectMocks private InviteAcceptanceService service;

    @Test
    void consumesInviteAndCreatesUserWhileHoldingLockedToken() throws Exception {
        InviteToken invite = validInvite("token");
        invite.setTeamId(7L);
        when(inviteTokenRepository.findByTokenForUpdate("token")).thenReturn(Optional.of(invite));
        when(userService.usernameExistsIgnoreCase("new@example.com")).thenReturn(false);

        AcceptanceResult result = service.accept("token", "NEW@example.com", "password123");

        assertEquals("new@example.com", result.username());
        assertTrue(invite.isUsed());
        ArgumentCaptor<SaveUserRequest> request = ArgumentCaptor.forClass(SaveUserRequest.class);
        verify(userService).saveUserCore(request.capture());
        assertEquals("new@example.com", request.getValue().getUsername());
        assertEquals(7L, request.getValue().getTeamId());
        verify(inviteTokenRepository).save(invite);
    }

    @Test
    void rejectsInviteThatWasConsumedByEarlierRequest() throws Exception {
        InviteToken invite = validInvite("token");
        invite.setUsed(true);
        when(inviteTokenRepository.findByTokenForUpdate("token")).thenReturn(Optional.of(invite));

        InviteAcceptanceException exception =
                assertThrows(
                        InviteAcceptanceException.class,
                        () -> service.accept("token", "second@example.com", "password123"));

        assertEquals(org.springframework.http.HttpStatus.NOT_FOUND, exception.getStatus());
        verify(userService, never()).saveUserCore(any());
    }

    @Test
    void repositoryLookupUsesPessimisticWriteLock() throws Exception {
        Method method = InviteTokenRepository.class.getMethod("findByTokenForUpdate", String.class);

        assertEquals(LockModeType.PESSIMISTIC_WRITE, method.getAnnotation(Lock.class).value());
    }

    @Test
    void acceptanceRollsBackForCheckedFailures() throws Exception {
        Method method =
                InviteAcceptanceService.class.getMethod(
                        "accept", String.class, String.class, String.class);

        Transactional transactional = method.getAnnotation(Transactional.class);
        assertTrue(java.util.List.of(transactional.rollbackFor()).contains(Exception.class));
    }

    private static InviteToken validInvite(String token) {
        InviteToken invite = new InviteToken();
        invite.setToken(token);
        invite.setExpiresAt(LocalDateTime.now().plusHours(1));
        invite.setRole(Role.USER.getRoleId());
        return invite;
    }
}
