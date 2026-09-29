package stirling.software.proprietary.policy.network;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.testcontainers.containers.Container;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Testcontainers;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.access.service.OwnershipService;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.security.service.UserService;

/**
 * End-to-end {@link NetworkInputSource} test over SMB against a real Samba server, through the
 * production {@link SmbFileClient}: listing a share, claiming, streaming the actual bytes, consume
 * delete, and save-time validation. The share is served world-writable so the SMB user can remove a
 * consumed file.
 */
@Testcontainers(disabledWithoutDocker = true)
@EnabledIfEnvironmentVariable(
        named = "RUN_NETWORK_INTEGRATION_TESTS",
        matches = "true",
        disabledReason =
                "Spins up SFTP/FTP/SMB containers; opt-in to keep several heavy containers off the"
                        + " standard CI runner. Run with RUN_NETWORK_INTEGRATION_TESTS=true.")
class SmbNetworkSourceIntegrationTest {

    private static final String POLICY = "p1";
    private static final String USER = "stirling";
    private static final String PASS = "secret";
    private static final String SHARE = "documents";
    private static final int SMB_PORT = 445;

    @org.testcontainers.junit.jupiter.Container
    static GenericContainer<?> samba =
            new GenericContainer<>("dperson/samba")
                    .withExposedPorts(SMB_PORT)
                    .withCommand(
                            "-p",
                            "-u",
                            USER + ";" + PASS,
                            "-s",
                            SHARE + ";/share;yes;no;no;" + USER)
                    .waitingFor(Wait.forListeningPort());

    private NetworkInputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() throws Exception {
        // The share dir must be writable by the SMB user so a consumed file can be deleted.
        samba.execInContainer("sh", "-c", "mkdir -p /share && chmod -R 0777 /share");
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowPrivateNetworkSources(true);
        RemoteFileClientFactory factory =
                new RemoteFileClientFactory(new NetworkHostGuard(properties));
        NetworkConnectionResolver resolver =
                new NetworkConnectionResolver(
                        mock(IntegrationConfigRepository.class),
                        mock(OwnershipService.class),
                        mock(UserService.class));
        source = new NetworkInputSource(resolver, factory);
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
    }

    @Test
    void consumeListsStreamsAndDeletes() throws Exception {
        put("doc.pdf", "hello smb");

        List<ResolvedInput> work = source.resolve(spec(Map.of()), ctx);

        assertThat(work).hasSize(1);
        String identity =
                "smb://"
                        + samba.getHost()
                        + ":"
                        + samba.getMappedPort(SMB_PORT)
                        + "/documents/doc.pdf";
        assertThat(ctx.present).containsExactly(identity);
        assertThat(read(work.get(0))).isEqualTo("hello smb");
        assertThat(source.resolve(spec(Map.of()), ctx)).isEmpty();

        work.get(0).onComplete().accept(true);
        assertThat(exists("doc.pdf")).isFalse();
        assertThat(source.resolve(spec(Map.of()), ctx)).isEmpty();
    }

    @Test
    void aFailedFileStaysOnTheShare() throws Exception {
        put("doc.pdf", "data");

        source.resolve(spec(Map.of()), ctx).get(0).onComplete().accept(false);

        assertThat(exists("doc.pdf")).isTrue();
        assertThat(source.resolve(spec(Map.of()), ctx)).isEmpty();
    }

    @Test
    void validateConnectsAndRejectsBadCredentials() {
        source.validate(spec(Map.of()));

        Map<String, Object> wrong = new HashMap<>(baseOptions());
        wrong.put("password", "not-the-password");
        assertThatThrownBy(() -> source.validate(new InputSpec("network", wrong)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cannot access");
    }

    private Map<String, Object> baseOptions() {
        Map<String, Object> options = new HashMap<>();
        options.put("protocol", "smb");
        options.put("host", samba.getHost());
        options.put("port", String.valueOf(samba.getMappedPort(SMB_PORT)));
        options.put("username", USER);
        options.put("password", PASS);
        options.put("share", SHARE);
        return options;
    }

    private InputSpec spec(Map<String, Object> extra) {
        Map<String, Object> options = new HashMap<>(baseOptions());
        options.putAll(extra);
        return new InputSpec("network", options);
    }

    private void put(String name, String content) throws Exception {
        String path = "/share/" + name;
        exec("printf '%s' '" + content + "' > " + path + " && chmod 0666 " + path);
    }

    private boolean exists(String name) throws Exception {
        return exec("test -f /share/" + name + " && echo yes || echo no").contains("yes");
    }

    private String exec(String script) throws Exception {
        Container.ExecResult result = samba.execInContainer("sh", "-c", script);
        return result.getStdout() + result.getStderr();
    }

    private static String read(ResolvedInput unit) throws IOException {
        try (InputStream stream = unit.inputs().primary().get(0).getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private class RecordingContext implements ResolveContext {

        private final List<String> present = new ArrayList<>();

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(POLICY, identity, gate, contentHash);
        }

        @Override
        public void settle(
                String identity, String finalGate, String finalContentHash, boolean success) {
            ledger.settle(POLICY, identity, finalGate, finalContentHash, success);
        }

        @Override
        public boolean allSettledDone(String identity) {
            return ledger.allSettledDone(identity);
        }

        @Override
        public void reportPresent(Collection<String> identities) {
            present.addAll(identities);
        }
    }
}
