package stirling.software.proprietary.policy.microsoft;

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
import stirling.software.proprietary.connectedaccount.InMemoryConnectedAccounts;
import stirling.software.proprietary.connectedaccount.MicrosoftOAuthClient;
import stirling.software.proprietary.integration.crypto.TestCredentialKey;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.integration.service.ConnectionLookup;
import stirling.software.proprietary.policy.remote.CloudDrive;
import stirling.software.proprietary.policy.remote.CloudDriveContract;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

class MicrosoftCloudDriveContractTest extends CloudDriveContract<MicrosoftDriveConfig, DriveFile> {

    private FakeGraphServer graph;
    private long accountId;

    @Override
    protected CloudDrive<MicrosoftDriveConfig, DriveFile> drive() throws Exception {
        TestCredentialKey.install();
        graph = new FakeGraphServer();
        GraphEndpoints endpoints = graph.endpoints();
        ApplicationProperties properties = new ApplicationProperties();
        ApplicationProperties.Premium.ProFeatures.Microsoft app =
                properties.getPremium().getProFeatures().getMicrosoft();
        app.setEnabled(true);
        app.setClientId("client-1");
        app.setClientSecret("server-secret");
        InMemoryConnectedAccounts accounts = new InMemoryConnectedAccounts();
        accountId = accounts.add(5L, CloudProvider.MICROSOFT, "rt-0").getId();
        User owner = new User();
        owner.setId(5L);
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(owner, null, List.of()));
        ConnectedAccountService connected =
                new ConnectedAccountService(
                        accounts.repository,
                        List.of(new MicrosoftOAuthClient(properties, endpoints)));
        ConnectionLookup lookup =
                new ConnectionLookup(
                        mock(IntegrationConfigRepository.class),
                        mock(OwnershipService.class),
                        mock(UserService.class));
        MicrosoftConnectionResolver resolver =
                new MicrosoftConnectionResolver(
                        lookup,
                        new ConnectedAccountAccess(connected, lookup, mock(UserService.class)),
                        properties);
        return new MicrosoftCloudDrive(
                resolver,
                new GraphDriveClient(endpoints, new GraphTokenProvider(endpoints, connected)));
    }

    @AfterEach
    void stop() {
        SecurityContextHolder.clearContext();
        graph.close();
    }

    @Override
    protected String type() {
        return "onedrive";
    }

    @Override
    protected Map<String, Object> options(String folder, Map<String, Object> extra) {
        Map<String, Object> options = new HashMap<>(extra);
        options.put("accountId", accountId);
        options.put("directory", folder);
        return options;
    }

    @Override
    protected void put(String folder, String name, String content) {
        graph.put(folder + "/" + name, content.getBytes(StandardCharsets.UTF_8));
    }

    @Override
    protected String content(String folder, String name) {
        return graph.content(folder + "/" + name);
    }
}
