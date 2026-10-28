package stirling.software.proprietary.policy.microsoft;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.LinkedHashMap;
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
import stirling.software.proprietary.connectedaccount.InMemoryConnectedAccounts;
import stirling.software.proprietary.connectedaccount.MicrosoftOAuthClient;
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
import stirling.software.proprietary.policy.output.MicrosoftDriveOutputSink;
import stirling.software.proprietary.policy.output.OutputDelivery;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

class MicrosoftDriveGraphTest {

    private static final String POLICY = "p1";
    private static final long CONNECTION = 7L;

    private FakeGraphServer graph;
    private IntegrationConfigRepository connections;
    private MicrosoftDriveInputSource source;
    private MicrosoftDriveOutputSink sink;
    private InProcessProcessedLedger ledger;
    private LedgerContext ctx;

    private InMemoryConnectedAccounts accounts;
    private ApplicationProperties properties;

    private final User alice = user(5L, "alice");
    private final User mallory = user(9L, "mallory");

    @BeforeEach
    void setUp() throws IOException {
        TestCredentialKey.install();
        graph = new FakeGraphServer();
        GraphEndpoints endpoints = graph.endpoints();
        properties = new ApplicationProperties();
        ApplicationProperties.Premium.ProFeatures.Microsoft app =
                properties.getPremium().getProFeatures().getMicrosoft();
        app.setEnabled(true);
        app.setClientId("client-1");
        app.setClientSecret("server-secret");
        accounts = new InMemoryConnectedAccounts();
        ConnectedAccountService connectedAccounts =
                new ConnectedAccountService(
                        accounts.repository,
                        List.of(new MicrosoftOAuthClient(properties, endpoints)));
        GraphDriveClient client =
                new GraphDriveClient(
                        endpoints, new GraphTokenProvider(endpoints, connectedAccounts));
        connections = mock(IntegrationConfigRepository.class);
        storeConnection("onedrive", true);
        UserService users = mock(UserService.class);
        when(users.findByUsername("alice")).thenReturn(Optional.of(alice));
        when(users.findByUsername("mallory")).thenReturn(Optional.of(mallory));
        ConnectionLookup lookup =
                new ConnectionLookup(connections, mock(OwnershipService.class), users);
        MicrosoftConnectionResolver resolver =
                new MicrosoftConnectionResolver(
                        lookup,
                        new ConnectedAccountAccess(connectedAccounts, lookup, users),
                        properties);
        MicrosoftCloudDrive drive = new MicrosoftCloudDrive(resolver, client);
        ledger = new InProcessProcessedLedger();
        source = new MicrosoftDriveInputSource(drive);
        sink = new MicrosoftDriveOutputSink(drive, ledger);
        ctx = new LedgerContext(POLICY);
    }

    @AfterEach
    void tearDown() {
        graph.close();
        SecurityContextHolder.clearContext();
    }

    private static User user(long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        return user;
    }

    private static void signIn(User user) {
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
    }

    private void storeConnection(String drive, boolean enabled) {
        IntegrationConfig connection = new IntegrationConfig();
        connection.setId(CONNECTION);
        connection.setName("Finance OneDrive");
        connection.setIntegrationType(IntegrationType.MICROSOFT_365);
        connection.setEnabled(enabled);
        connection.setConfig(
                "{\"drive\":\""
                        + drive
                        + "\",\"tenantId\":\"contoso.onmicrosoft.com\",\"clientId\":\"c\","
                        + "\"clientSecret\":\"s\",\"user\":\""
                        + FakeGraphServer.USER
                        + "\",\"siteUrl\":\"https://contoso.sharepoint.com/sites/x\"}");
        when(connections.findById(CONNECTION)).thenReturn(Optional.of(connection));
    }

    private static InputSpec onedrive(Map<String, Object> extra) {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("connectionId", CONNECTION);
        options.put("directory", "Inbox");
        options.putAll(extra);
        return new InputSpec("onedrive", options);
    }

    private static OutputSpec onedriveOut(String directory) {
        return new OutputSpec(
                "onedrive",
                Map.of("connectionId", String.valueOf(CONNECTION), "directory", directory));
    }

    @Test
    void recursiveListingDescendsIntoSubfolders() throws Exception {
        graph.put("Inbox/a.pdf", "a");
        graph.put("Inbox/2026/October/b.pdf", "b");
        graph.put("Inbox/.hidden.pdf", "skip");

        assertEquals(1, source.resolve(onedrive(Map.of("mode", "snapshot")), ctx).size());
        assertEquals(
                2,
                source.resolve(onedrive(Map.of("mode", "snapshot", "recursive", "true")), ctx)
                        .size());
    }

    @Test
    void downloadsNeverCarryTheBearerToken() throws Exception {
        graph.put("Inbox/doc.pdf", "secret content");
        Resource resource =
                source.resolve(onedrive(Map.of("mode", "snapshot")), ctx)
                        .getFirst()
                        .inputs()
                        .primary()
                        .getFirst();
        try (InputStream in = resource.getInputStream()) {
            in.readAllBytes();
        }
        assertTrue(graph.authorizedOffGraph.isEmpty());
    }

    @Test
    void aMissingFolderIsAnErrorNotAnEmptyListing() {
        graph.put("Other/doc.pdf", "x");
        assertThrows(IOException.class, () -> source.resolve(onedrive(Map.of()), ctx));
        assertThrows(IllegalArgumentException.class, () -> source.validate(onedrive(Map.of())));
    }

    @Test
    void throttledCallsAreRetried() throws Exception {
        graph.put("Inbox/doc.pdf", "x");
        graph.throttleNext.set(2);
        assertEquals(1, source.resolve(onedrive(Map.of("mode", "snapshot")), ctx).size());
    }

    @Test
    void tokensAreReusedAcrossCalls() throws Exception {
        graph.put("Inbox/doc.pdf", "x");
        source.resolve(onedrive(Map.of("mode", "snapshot")), ctx);
        source.resolve(onedrive(Map.of("mode", "snapshot")), ctx);
        assertEquals(1, graph.tokenRequests.get());
    }

    @Test
    void aSharePointSourceRefusesAOneDriveConnection() {
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        source.resolve(
                                new InputSpec("sharepoint", Map.of("connectionId", CONNECTION)),
                                ctx));
    }

    @Test
    void aDisabledConnectionCannotBeUsed() {
        storeConnection("onedrive", false);
        assertThrows(IllegalArgumentException.class, () -> source.resolve(onedrive(Map.of()), ctx));
    }

    @Test
    void largeOutputsUseAnUploadSession() throws Exception {
        byte[] large =
                new byte
                        [(int) GraphDriveClient.SIMPLE_UPLOAD_LIMIT
                                + GraphDriveClient.UPLOAD_CHUNK
                                + 17];
        new Random(1).nextBytes(large);

        sink.deliver(
                new OutputDelivery("run-1", POLICY),
                List.of(named(large, "big.pdf")),
                onedriveOut("Done"));

        assertEquals(large.length, graph.files.get("Done/big.pdf").length);
        assertTrue(graph.authorizedOffGraph.isEmpty());
    }

    @Test
    void aConnectedAccountWorksInItsOwnOneDrive() throws Exception {
        signIn(alice);
        ConnectedAccount account = accounts.add(5L, CloudProvider.MICROSOFT, "rt-0");
        graph.put("Scans/in.pdf", "mine");

        List<ResolvedInput> work =
                source.resolve(
                        new InputSpec(
                                "onedrive",
                                Map.of(
                                        "accountId",
                                        account.getId(),
                                        "directory",
                                        "Scans",
                                        "mode",
                                        "consume")),
                        ctx);

        assertEquals(1, work.size());
        try (InputStream in = work.getFirst().inputs().primary().getFirst().getInputStream()) {
            assertEquals("mine", new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
        work.getFirst().onComplete().accept(true);
        assertNull(graph.content("Scans/in.pdf"));
    }

    @Test
    void aPastedFolderLinkAnchorsAConnectedAccountsSharePointLocation() throws Exception {
        signIn(alice);
        ConnectedAccount account = accounts.add(5L, CloudProvider.MICROSOFT, "rt-0");
        graph.put("Sites/Finance/Invoices/march.pdf", "invoice");
        Map<String, Object> options =
                Map.of(
                        "accountId",
                        account.getId(),
                        "directory",
                        FakeGraphServer.folderLink("Sites/Finance/Invoices"));

        assertEquals(1, source.resolve(new InputSpec("sharepoint", options), ctx).size());
        sink.deliver(
                new OutputDelivery("run-1", POLICY),
                List.of(named(bytes("processed"), "march-done.pdf")),
                new OutputSpec("sharepoint", options));

        assertEquals("processed", graph.content("Sites/Finance/Invoices/march-done.pdf"));
        assertTrue(source.resolve(new InputSpec("sharepoint", options), ctx).isEmpty());
    }

    @Test
    void someoneElsesConnectedAccountCannotBeUsed() {
        ConnectedAccount account = accounts.add(5L, CloudProvider.MICROSOFT, "rt-0");
        signIn(mallory);

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        source.validate(
                                new InputSpec(
                                        "onedrive",
                                        Map.of("accountId", account.getId(), "directory", "In"))));
    }

    @Test
    void anUnattendedRunWritesToItsOwnersAccount() throws Exception {
        ConnectedAccount account = accounts.add(5L, CloudProvider.MICROSOFT, "rt-0");

        sink.deliver(
                new OutputDelivery("run-1", POLICY, null, null, null, "alice"),
                List.of(named(bytes("processed"), "done.pdf")),
                new OutputSpec(
                        "onedrive", Map.of("accountId", account.getId(), "directory", "Out")));

        assertEquals("processed", graph.content("Out/done.pdf"));
    }

    @Test
    void anUnattendedRunCannotWriteToAnotherUsersAccount() {
        ConnectedAccount account = accounts.add(5L, CloudProvider.MICROSOFT, "rt-0");

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        sink.deliver(
                                new OutputDelivery("run-1", POLICY, null, null, null, "mallory"),
                                List.of(named(bytes("planted"), "done.pdf")),
                                new OutputSpec(
                                        "onedrive",
                                        Map.of("accountId", account.getId(), "directory", "Out"))));
        assertNull(graph.content("Out/done.pdf"));
    }

    @Test
    void anAccountIsRefusedWhenNobodyIsActing() {
        ConnectedAccount account = accounts.add(5L, CloudProvider.MICROSOFT, "rt-0");
        graph.put("Scans/in.pdf", "mine");
        SecurityContextHolder.clearContext();

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        source.resolve(
                                new InputSpec(
                                        "onedrive",
                                        Map.of("accountId", account.getId(), "directory", "Scans")),
                                ctx));
    }

    @Test
    void accountLocationsStopWhenTheAdminTurnsConnectionsOff() {
        signIn(alice);
        ConnectedAccount account = accounts.add(5L, CloudProvider.MICROSOFT, "rt-0");
        properties.getPremium().getProFeatures().getMicrosoft().setAllowAccountConnections(false);

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        source.resolve(
                                new InputSpec("onedrive", Map.of("accountId", account.getId())),
                                ctx));
    }

    @Test
    void aBlankConnectionSecretUsesTheServersApp() throws Exception {
        IntegrationConfig connection = new IntegrationConfig();
        connection.setId(CONNECTION);
        connection.setName("Pinned OneDrive");
        connection.setIntegrationType(IntegrationType.MICROSOFT_365);
        connection.setEnabled(true);
        connection.setConfig(
                "{\"drive\":\"onedrive\",\"tenantId\":\"contoso.onmicrosoft.com\",\"user\":\""
                        + FakeGraphServer.USER
                        + "\"}");
        when(connections.findById(CONNECTION)).thenReturn(Optional.of(connection));
        graph.put("Inbox/a.pdf", "a");

        assertEquals(1, source.resolve(onedrive(Map.of("mode", "snapshot")), ctx).size());
        assertEquals("client-1", graph.tokenForms.getLast().get("client_id"));
        assertEquals("server-secret", graph.tokenForms.getLast().get("client_secret"));
    }

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private static Resource named(byte[] content, String name) {
        return new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }

    private final class LedgerContext implements ResolveContext {
        private final String policyId;

        private LedgerContext(String policyId) {
            this.policyId = policyId;
        }

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(policyId, identity, gate, contentHash);
        }

        @Override
        public void settle(
                String identity, String finalGate, String finalContentHash, boolean success) {
            ledger.settle(policyId, identity, finalGate, finalContentHash, success);
        }

        @Override
        public boolean allSettledDone(String identity) {
            return ledger.allSettledDone(identity);
        }

        @Override
        public void reportPresent(Collection<String> identities) {}
    }
}
