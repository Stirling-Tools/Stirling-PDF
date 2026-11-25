package stirling.software.proprietary.policy.google;

import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountAccess;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.ConnectionLookup;
import stirling.software.proprietary.policy.remote.LocationOptions;

@Service
@RequiredArgsConstructor
public class GoogleConnectionResolver {

    private final ConnectionLookup connections;
    private final ConnectedAccountAccess accountAccess;

    public GoogleDriveConfig resolve(Map<String, Object> options, String owner) {
        if (ConnectedAccountAccess.usesAccount(options)) {
            ConnectedAccount account = accountAccess.require(options, CloudProvider.GOOGLE, owner);
            return GoogleDriveConfig.forAccount(account.getId(), options);
        }
        return GoogleDriveConfig.fromConnection(
                connections.load(
                        options,
                        IntegrationType.GOOGLE_WORKSPACE,
                        "Google Workspace",
                        LocationOptions.PER_USE_KEYS,
                        owner));
    }
}
