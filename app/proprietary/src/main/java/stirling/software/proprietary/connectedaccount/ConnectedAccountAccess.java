package stirling.software.proprietary.connectedaccount;

import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.integration.service.ConnectionLookup;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

@Service
@RequiredArgsConstructor
public class ConnectedAccountAccess {

    public static final String ACCOUNT_OPTION = "accountId";

    private final ConnectedAccountService service;
    private final ConnectionLookup connections;
    private final UserService userService;

    public static boolean usesAccount(Map<String, Object> options) {
        Object value = options.get(ACCOUNT_OPTION);
        return value != null && !value.toString().isBlank();
    }

    public ConnectedAccount require(
            Map<String, Object> options, CloudProvider provider, String owner) {
        long id;
        try {
            id = Long.parseLong(options.get(ACCOUNT_OPTION).toString().trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("'accountId' is not a valid account reference");
        }
        if (!service.isAvailable(provider)) {
            throw new IllegalArgumentException(
                    "connecting your own "
                            + provider.id()
                            + " account is turned off on this server; use an organisation"
                            + " connection");
        }
        User actingUser =
                owner != null
                        ? userService.findByUsername(owner).orElse(null)
                        : connections.currentUser();
        if (actingUser == null) {
            throw new IllegalArgumentException(
                    "a connected "
                            + provider.id()
                            + " account can only be used by a pipeline with a known owner");
        }
        return service.find(id)
                .filter(account -> account.getProvider().equals(provider.id()))
                .filter(account -> account.getOwnerUserId().equals(actingUser.getId()))
                .orElseThrow(
                        () ->
                                new IllegalArgumentException(
                                        "choose one of your own connected "
                                                + provider.id()
                                                + " accounts"));
    }
}
