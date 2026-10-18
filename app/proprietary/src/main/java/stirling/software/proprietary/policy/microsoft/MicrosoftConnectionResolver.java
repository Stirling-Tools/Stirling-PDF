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

/**
 * Turns a OneDrive/SharePoint location's options into a {@link MicrosoftDriveConfig}: either a
 * connected account ({@code accountId}, checked by {@link ConnectedAccountAccess}) or an
 * organisation connection ({@code connectionId}, a stored MICROSOFT_365 connection whose blank
 * credentials fall back to the server's Entra app). There is no embedded-credentials form: the
 * connection is what pins the library, so it must exist.
 */
@Service
@RequiredArgsConstructor
public class MicrosoftConnectionResolver {

    private static final Set<String> PER_USE_KEYS = Set.of("directory", "mode", "recursive");

    private final ConnectionLookup connections;
    private final ConnectedAccountAccess accountAccess;
    private final ApplicationProperties applicationProperties;

    /**
     * Resolves {@code options} for a location of {@code expected} kind; an organisation connection
     * must point at the same kind of library.
     */
    public MicrosoftDriveConfig resolve(Map<String, Object> options, MicrosoftDrive expected) {
        if (ConnectedAccountAccess.usesAccount(options)) {
            ConnectedAccount account = accountAccess.require(options, CloudProvider.MICROSOFT);
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

    /** The server's own Entra app, which organisation connections fall back to. */
    public MicrosoftDriveConfig.AppDefaults appDefaults() {
        ApplicationProperties.Premium.ProFeatures.Microsoft app =
                applicationProperties.getPremium().getProFeatures().getMicrosoft();
        return new MicrosoftDriveConfig.AppDefaults(
                app.getTenant(), app.getClientId(), app.getClientSecret());
    }
}
