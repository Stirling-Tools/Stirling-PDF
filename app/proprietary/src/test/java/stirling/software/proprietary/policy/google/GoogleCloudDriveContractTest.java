package stirling.software.proprietary.policy.google;

import static org.mockito.Mockito.mock;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.access.service.OwnershipService;
import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccountAccess;
import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.connectedaccount.GoogleOAuthClient;
import stirling.software.proprietary.connectedaccount.InMemoryConnectedAccounts;
import stirling.software.proprietary.integration.crypto.TestCredentialKey;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.integration.service.ConnectionLookup;
import stirling.software.proprietary.policy.remote.CloudDrive;
import stirling.software.proprietary.policy.remote.CloudDriveContract;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

class GoogleCloudDriveContractTest extends CloudDriveContract<GoogleDriveConfig, GoogleFile> {

    private FakeGoogleServer google;
    private long accountId;
    private final Map<String, String> folders = new HashMap<>();

    @Override
    protected CloudDrive<GoogleDriveConfig, GoogleFile> drive() throws Exception {
        TestCredentialKey.install();
        google = new FakeGoogleServer();
        ApplicationProperties properties = new ApplicationProperties();
        ApplicationProperties.Premium.ProFeatures.GoogleDrive app =
                properties.getPremium().getProFeatures().getGoogleDrive();
        app.setEnabled(true);
        app.setClientId("google-client");
        app.setClientSecret(FakeGoogleServer.CLIENT_SECRET);
        InMemoryConnectedAccounts accounts = new InMemoryConnectedAccounts();
        accountId = accounts.add(5L, CloudProvider.GOOGLE, "google-refresh").getId();
        User owner = new User();
        owner.setId(5L);
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(owner, null, List.of()));
        ConnectedAccountService connected =
                new ConnectedAccountService(
                        accounts.repository,
                        List.of(new GoogleOAuthClient(properties, google.endpoints())));
        ConnectionLookup lookup =
                new ConnectionLookup(
                        mock(IntegrationConfigRepository.class),
                        mock(OwnershipService.class),
                        mock(UserService.class));
        String scans = google.folder("root", "Scans");
        folders.put("Inbox", google.folder(scans, "Inbox"));
        folders.put("Done", google.folder(scans, "Done"));
        return new GoogleCloudDrive(
                new GoogleConnectionResolver(
                        lookup,
                        new ConnectedAccountAccess(connected, lookup, mock(UserService.class))),
                new GoogleDriveClient(
                        google.endpoints(),
                        new GoogleTokenProvider(google.endpoints(), connected)));
    }

    @AfterEach
    void stop() {
        SecurityContextHolder.clearContext();
        google.close();
    }

    @Override
    protected String type() {
        return "googledrive";
    }

    @Override
    protected Map<String, Object> options(String folder, Map<String, Object> extra) {
        Map<String, Object> options = new HashMap<>(extra);
        options.put("accountId", accountId);
        options.put("directory", folders.getOrDefault(folder, "Scans/" + folder));
        return options;
    }

    @Override
    protected void put(String folder, String name, String content) {
        String parent = folders.get(folder);
        FakeGoogleServer.Item existing = google.named(parent, name);
        if (existing == null) {
            google.file(parent, name, content);
        } else {
            existing.content = content.getBytes(StandardCharsets.UTF_8);
            existing.version++;
        }
    }

    @Override
    protected String content(String folder, String name) {
        FakeGoogleServer.Item item = google.named(folders.get(folder), name);
        return item == null ? null : new String(item.content, StandardCharsets.UTF_8);
    }
}
