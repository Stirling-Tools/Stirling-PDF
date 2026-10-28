package stirling.software.proprietary.policy.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.model.ApplicationProperties;
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
import stirling.software.proprietary.security.model.User;
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
    private InProcessProcessedLedger ledger;
    private Ctx ctx;
    private ConnectedAccount account;
    private String inbox;

    @BeforeEach
    void setUp() throws Exception {
        TestCredentialKey.install();
        google = new FakeGoogleServer();
        ApplicationProperties properties = new ApplicationProperties();
        ApplicationProperties.Premium.ProFeatures.GoogleDrive app =
                properties.getPremium().getProFeatures().getGoogleDrive();
        app.setEnabled(true);
        app.setClientId("google-client");
        app.setClientSecret(FakeGoogleServer.CLIENT_SECRET);
        accounts = new InMemoryConnectedAccounts();
        ConnectedAccountService connected =
                new ConnectedAccountService(
                        accounts.repository,
                        List.of(new GoogleOAuthClient(properties, google.endpoints())));
        GoogleDriveClient drive =
                new GoogleDriveClient(
                        google.endpoints(), new GoogleTokenProvider(google.endpoints(), connected));
        UserService users = mock(UserService.class);
        connections = mock(IntegrationConfigRepository.class);
        ConnectionLookup lookup =
                new ConnectionLookup(connections, mock(OwnershipService.class), users);
        GoogleConnectionResolver resolver =
                new GoogleConnectionResolver(
                        lookup, new ConnectedAccountAccess(connected, lookup, users));
        GoogleCloudDrive cloud = new GoogleCloudDrive(resolver, drive);
        ledger = new InProcessProcessedLedger();
        source = new GoogleDriveInputSource(cloud);
        sink = new GoogleDriveOutputSink(cloud, ledger);
        ctx = new Ctx(POLICY);
        account = accounts.add(5L, CloudProvider.GOOGLE, "google-refresh");
        User owner = new User();
        owner.setId(5L);
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(owner, null, List.of()));
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
        SecurityContextHolder.clearContext();
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

    private static ByteArrayResource named(String text, String name) {
        return named(text.getBytes(StandardCharsets.UTF_8), name);
    }

    private static ByteArrayResource named(byte[] content, String name) {
        return new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }

    private final class Ctx implements ResolveContext {
        private final String policyId;

        private Ctx(String policyId) {
            this.policyId = policyId;
        }

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(policyId, identity, gate, contentHash);
        }

        @Override
        public void settle(String identity, String finalGate, String hash, boolean success) {
            ledger.settle(policyId, identity, finalGate, hash, success);
        }

        @Override
        public boolean allSettledDone(String identity) {
            return ledger.allSettledDone(identity);
        }

        @Override
        public void reportPresent(Collection<String> identities) {}
    }
}
