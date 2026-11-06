package stirling.software.proprietary.policy.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static stirling.software.proprietary.policy.remote.CloudDriveFixtures.ledgerContext;
import static stirling.software.proprietary.policy.remote.CloudDriveFixtures.named;
import static stirling.software.proprietary.policy.remote.CloudDriveFixtures.signIn;
import static stirling.software.proprietary.policy.remote.CloudDriveFixtures.user;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.proprietary.access.service.OwnershipService;
import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountAccess;
import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.connectedaccount.GoogleOAuthClient;
import stirling.software.proprietary.connectedaccount.InMemoryConnectedAccounts;
import stirling.software.proprietary.integration.crypto.TestCredentialKey;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.integration.service.ConnectionLookup;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.output.GoogleDriveOutputSink;
import stirling.software.proprietary.policy.output.OutputDelivery;
import stirling.software.proprietary.security.service.UserService;

import tools.jackson.databind.ObjectMapper;

class GoogleDriveTest {

    private static final String POLICY = "p1";
    private static final long CONNECTION = 11L;

    private FakeGoogleServer google;
    private InMemoryConnectedAccounts accounts;
    private IntegrationConfigRepository connections;
    private GoogleDriveInputSource source;
    private GoogleDriveOutputSink sink;
    private ResolveContext ctx;
    private ConnectedAccount account;
    private String inbox;
    private final OwnershipService ownership = mock(OwnershipService.class);

    @BeforeEach
    void setUp() throws Exception {
        TestCredentialKey.install();
        google = new FakeGoogleServer();
        accounts = new InMemoryConnectedAccounts();
        ConnectedAccountService connected =
                new ConnectedAccountService(
                        accounts.repository,
                        List.of(
                                new GoogleOAuthClient(
                                        FakeGoogleServer.serverApp(), google.endpoints())));
        GoogleDriveClient drive =
                new GoogleDriveClient(
                        google.endpoints(), new GoogleTokenProvider(google.endpoints(), connected));
        UserService users = mock(UserService.class);
        connections = mock(IntegrationConfigRepository.class);
        ConnectionLookup lookup = new ConnectionLookup(connections, ownership, users);
        GoogleConnectionResolver resolver =
                new GoogleConnectionResolver(lookup, new ConnectedAccountAccess(connected, lookup));
        GoogleCloudDrive cloud = new GoogleCloudDrive(resolver, drive);
        InProcessProcessedLedger ledger = new InProcessProcessedLedger();
        source = new GoogleDriveInputSource(cloud);
        sink = new GoogleDriveOutputSink(cloud, ledger);
        ctx = ledgerContext(ledger, POLICY);
        account = accounts.add(5L, CloudProvider.GOOGLE, "google-refresh");
        signIn(user(5L, "pat"));
        String scans = google.folder("root", "Scans");
        inbox = google.folder(scans, "Inbox");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        google.close();
    }

    private Map<String, Object> mine(String directory) {
        return Map.of("accountId", account.getId(), "directory", directory);
    }

    @Test
    void aMyDrivePathResolvesAndConsumeBinsTheProcessedFile() throws Exception {
        String id = google.file(inbox, "scan.pdf", "pdf bytes");

        Map<String, Object> options = new HashMap<>(mine("Scans/Inbox"));
        options.put("mode", "consume");
        List<ResolvedInput> work = source.resolve(new InputSpec("googledrive", options), ctx);

        assertThat(work).hasSize(1);
        Resource resource = work.getFirst().inputs().primary().getFirst();
        assertThat(resource.getFilename()).isEqualTo("scan.pdf");
        try (InputStream in = resource.getInputStream()) {
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8))
                    .isEqualTo("pdf bytes");
        }
        work.getFirst().onComplete().accept(true);
        assertThat(google.items.get(id).trashed).isTrue();
    }

    @Test
    void aFolderLinkWorksAndAMissingFolderIsAnError() throws Exception {
        google.file(inbox, "a.pdf", "a");
        String link = "https://drive.google.com/drive/folders/" + inbox + "?usp=sharing";

        assertThat(source.resolve(new InputSpec("googledrive", mine(link)), ctx)).hasSize(1);
        assertThrows(
                IllegalArgumentException.class,
                () -> source.validate(new InputSpec("googledrive", mine("Scans/Nope"))));
    }

    @Test
    void largeOutputsUseAResumableUpload() throws Exception {
        byte[] large = new byte[(int) GoogleDriveClient.SIMPLE_UPLOAD_LIMIT + 1234];
        new Random(3).nextBytes(large);

        sink.deliver(
                new OutputDelivery("run-1", POLICY),
                List.of(named(large, "big.pdf")),
                new OutputSpec("googledrive", mine(inbox)));

        assertThat(google.named(inbox, "big.pdf").content).isEqualTo(large);
    }

    @Test
    void aServiceAccountSignsItsOwnAssertionAndActsAsTheSubject() throws Exception {
        when(ownership.canUse(any(), any(), any())).thenReturn(true);
        IntegrationConfig connection = new IntegrationConfig();
        connection.setId(CONNECTION);
        connection.setName("Workspace bot");
        connection.setIntegrationType(IntegrationType.GOOGLE_WORKSPACE);
        connection.setEnabled(true);
        connection.setConfig(
                new ObjectMapper()
                        .createObjectNode()
                        .put("credentialsJson", google.serviceAccountJson())
                        .put("subject", "bot@contoso.com")
                        .toString());
        when(connections.findById(CONNECTION)).thenReturn(Optional.of(connection));
        google.file(inbox, "org.pdf", "org");

        List<ResolvedInput> work =
                source.resolve(
                        new InputSpec(
                                "googledrive",
                                Map.of(
                                        "connectionId",
                                        CONNECTION,
                                        "directory",
                                        inbox,
                                        "mode",
                                        "snapshot")),
                        ctx);

        assertThat(work).hasSize(1);
        assertThat(google.assertions).hasSize(1);
        assertThat(google.assertions.getFirst().path("iss").asString())
                .isEqualTo(FakeGoogleServer.SERVICE_EMAIL);
        assertThat(google.assertions.getFirst().path("sub").asString())
                .isEqualTo("bot@contoso.com");
        assertThat(google.assertions.getFirst().path("aud").asString())
                .isEqualTo(google.baseUrl() + "/token");
    }

    @Test
    void aServiceAccountKeyWithoutAPrivateKeyIsRejected() {
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        GoogleDriveConfig.serviceAccount(
                                Map.of("credentialsJson", "{\"client_email\":\"x@y\"}")));
        assertThrows(
                IllegalArgumentException.class,
                () -> GoogleDriveConfig.serviceAccount(Map.of("credentialsJson", "not json")));
    }
}
