package stirling.software.proprietary.policy.microsoft;

import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountAccess;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.service.ConnectionLookup;

@Service
@RequiredArgsConstructor
public class MicrosoftConnectionResolver {

    private static final Set<String> PER_USE_KEYS = Set.of("directory", "mode", "recursive");

    private final ConnectionLookup connections;
    private final ConnectedAccountAccess accountAccess;
    private final ApplicationProperties applicationProperties;

    public MicrosoftDriveConfig resolve(
            Map<String, Object> options, MicrosoftDrive expected, String owner) {
        if (ConnectedAccountAccess.usesAccount(options)) {
            ConnectedAccount account =
                    accountAccess.require(options, CloudProvider.MICROSOFT, owner);
            return MicrosoftDriveConfig.forAccount(
                    expected == null ? MicrosoftDrive.ONEDRIVE : expected,
                    account.getId(),
                    options);
        }
        MicrosoftDriveConfig config =
                MicrosoftDriveConfig.fromConnection(
                        connections.load(
                                options,
                                IntegrationType.MICROSOFT_365,
                                "Microsoft 365",
                                PER_USE_KEYS),
                        appDefaults());
        if (expected != null && config.drive() != expected) {
            throw new IllegalArgumentException(
                    "a "
                            + expected.sourceType()
                            + " location needs a "
                            + expected.sourceType()
                            + " connection, not a "
                            + config.drive().sourceType()
                            + " one");
        }
        return config;
    }

    public MicrosoftDriveConfig.AppDefaults appDefaults() {
        ApplicationProperties.Premium.ProFeatures.Microsoft app =
                applicationProperties.getPremium().getProFeatures().getMicrosoft();
        return new MicrosoftDriveConfig.AppDefaults(
                app.getTenant(), app.getClientId(), app.getClientSecret());
    }
}
