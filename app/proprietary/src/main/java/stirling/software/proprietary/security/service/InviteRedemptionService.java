package stirling.software.proprietary.security.service;

import java.sql.SQLException;
import java.time.LocalDateTime;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.model.InviteToken;
import stirling.software.proprietary.security.repository.InviteTokenRepository;

/**
 * Redeems invite tokens. Exists so token consumption and account creation share one transaction: a
 * controller cannot do that itself, because a self-invoked {@code @Transactional} method never goes
 * through the proxy.
 */
@Service
@RequiredArgsConstructor
public class InviteRedemptionService {

    private final InviteTokenRepository inviteTokenRepository;
    private final UserService userService;

    /**
     * Consumes {@code invite} and creates its account as one unit. Consumption comes first and
     * holds the token's row for the rest of the transaction, so concurrent redemptions of a
     * single-use token serialize and only the first creates an account. Any failure creating the
     * account propagates and rolls the consumption back, leaving the link usable.
     *
     * @param username the account to create, already resolved against the invite's bound email
     * @return false when another request consumed the token first; no account was created
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean redeem(InviteToken invite, String username, String password)
            throws SQLException, UnsupportedProviderException {
        Long teamId = invite.getTeamId();
        String role = invite.getRole();
        if (inviteTokenRepository.consumeIfUnused(invite.getId(), LocalDateTime.now()) == 0) {
            return false;
        }
        userService.saveUserCore(
                SaveUserRequest.builder()
                        .username(username)
                        .password(password)
                        .teamId(teamId)
                        .role(role)
                        .build());
        return true;
    }
}
