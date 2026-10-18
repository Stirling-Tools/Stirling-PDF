package stirling.software.proprietary.policy.google;

import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountAccess;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.ConnectionLookup;

/**
 * Turns a Google Drive location's options into a {@link GoogleDriveConfig}: either a connected
 * account ({@code accountId}, checked by {@link ConnectedAccountAccess}) or an organisation
 * connection ({@code connectionId}, a stored GOOGLE_WORKSPACE service account).
 */
@Service
@RequiredArgsConstructor
public class GoogleConnectionResolver {

    private static final Set<String> PER_USE_KEYS = Set.of("directory", "mode", "recursive");

    private final ConnectionLookup connections;
    private final ConnectedAccountAccess accountAccess;

    public GoogleDriveConfig resolve(Map<String, Object> options) {
        if (ConnectedAccountAccess.usesAccount(options)) {
            ConnectedAccount account = accountAccess.require(options, CloudProvider.GOOGLE);
            return GoogleDriveConfig.forAccount(account.getId(), options);
        }
        return GoogleDriveConfig.fromConnection(
                connections.load(
                        options,
                        IntegrationType.GOOGLE_WORKSPACE,
                        "Google Workspace",
                        PER_USE_KEYS));
    }
}
