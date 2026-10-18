package stirling.software.proprietary.connectedaccount;

import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.integration.service.ConnectionLookup;
import stirling.software.proprietary.security.model.User;

/**
 * Decides whether a pipeline location may act as a connected account. Only the account's owner may
 * point a source or destination at it: a teammate editing the location must switch it to an account
 * of their own, so nobody can borrow another user's files. A background sweep has no caller and is
 * allowed, since the location was checked when its owner saved it.
 */
@Service
@RequiredArgsConstructor
public class ConnectedAccountAccess {

    public static final String ACCOUNT_OPTION = "accountId";

    private final ConnectedAccountService service;
    private final ConnectionLookup connections;

    /** Whether the options choose a connected account rather than an organisation connection. */
    public static boolean usesAccount(Map<String, Object> options) {
        Object value = options.get(ACCOUNT_OPTION);
        return value != null && !value.toString().isBlank();
    }

    /**
     * The account the options name, after the ownership and server-policy checks.
     *
     * @throws IllegalArgumentException when it is missing, someone else's, for another provider, or
     *     account connections are turned off
     */
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
                // Missing and someone else's collapse into one error, so ids cannot be probed.
                .orElseThrow(
                        () ->
                                new IllegalArgumentException(
                                        "choose one of your own connected "
                                                + provider.id()
                                                + " accounts"));
    }
}
