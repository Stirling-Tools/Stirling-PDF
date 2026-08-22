package stirling.software.proprietary.security.service;

import java.time.LocalDateTime;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.InviteToken;
import stirling.software.proprietary.security.repository.InviteTokenRepository;

/** Atomically consumes an invite and creates the invited account. */
@Service
@RequiredArgsConstructor
public class InviteAcceptanceService {

    private final InviteTokenRepository inviteTokenRepository;
    private final UserService userService;

    @Transactional(rollbackFor = Exception.class)
    public AcceptanceResult accept(String token, String requestedEmail, String password)
            throws Exception {
        InviteToken invite =
                inviteTokenRepository
                        .findByTokenForUpdate(token)
                        .orElseThrow(InviteAcceptanceException::invalidInvite);

        if (invite.isUsed() || invite.isExpired()) {
            throw InviteAcceptanceException.invalidInvite();
        }

        String effectiveEmail = resolveEmail(invite, requestedEmail);
        if (userService.usernameExistsIgnoreCase(effectiveEmail)) {
            throw InviteAcceptanceException.invalidInvite();
        }

        SaveUserRequest request =
                SaveUserRequest.builder()
                        .username(effectiveEmail)
                        .password(password)
                        .teamId(invite.getTeamId())
                        .role(invite.getRole())
                        .build();
        userService.saveUserCore(request);

        invite.setUsed(true);
        invite.setUsedAt(LocalDateTime.now());
        inviteTokenRepository.save(invite);

        return new AcceptanceResult(effectiveEmail, invite.getRole());
    }

    private String resolveEmail(InviteToken invite, String requestedEmail) {
        if (invite.getEmail() != null) {
            return invite.getEmail();
        }
        if (requestedEmail == null || requestedEmail.trim().isEmpty()) {
            throw new InviteAcceptanceException(
                    HttpStatus.BAD_REQUEST, "Email address is required");
        }
        if (!requestedEmail.contains("@")) {
            throw new InviteAcceptanceException(HttpStatus.BAD_REQUEST, "Invalid email address");
        }
        return requestedEmail.trim().toLowerCase();
    }

    public record AcceptanceResult(String username, String role) {}

    @Getter
    public static class InviteAcceptanceException extends RuntimeException {
        private final HttpStatus status;

        public InviteAcceptanceException(HttpStatus status, String message) {
            super(message);
            this.status = status;
        }

        public static InviteAcceptanceException invalidInvite() {
            return new InviteAcceptanceException(HttpStatus.NOT_FOUND, "Invalid invite link");
        }
    }
}
