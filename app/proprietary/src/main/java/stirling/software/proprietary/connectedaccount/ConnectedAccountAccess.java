package stirling.software.proprietary.connectedaccount;

import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.integration.service.ConnectionLookup;
import stirling.software.proprietary.security.model.User;

@Service
@RequiredArgsConstructor
public class ConnectedAccountAccess {

    public static final String ACCOUNT_OPTION = "accountId";

    private final ConnectedAccountService service;
    private final ConnectionLookup connections;

    public static boolean usesAccount(Map<String, Object> options) {
        Object value = options.get(ACCOUNT_OPTION);
        return value != null && !value.toString().isBlank();
    }

    public ConnectedAccount require(Map<String, Object> options, CloudProvider provider) {
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
        User caller = connections.currentUser();
        return service.find(id)
                .filter(account -> account.getProvider().equals(provider.id()))
                .filter(
                        account ->
                                caller == null || account.getOwnerUserId().equals(caller.getId()))
                .orElseThrow(
                        () ->
                                new IllegalArgumentException(
                                        "choose one of your own connected "
                                                + provider.id()
                                                + " accounts"));
    }
}
