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
import org.testcontainers.containers.Container;
import org.testcontainers.containers.FixedHostPortGenericContainer;
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
 * End-to-end {@link NetworkInputSource} test over FTP against a real vsftpd server, through the
 * production {@link FtpFileClient}: listing, claiming, streaming the actual bytes (exercising the
 * passive data channel and {@code completePendingCommand}), consume delete, and save-time
 * validation. Passive FTP hands the client a data port, so the control and one passive port are
 * pinned to fixed host ports and the server advertises 127.0.0.1 - the only way this works through
 * Testcontainers' per-run port mapping.
 */
@Testcontainers(disabledWithoutDocker = true)
class FtpNetworkSourceIntegrationTest {

    private static final String POLICY = "p1";
    private static final String USER = "stirling";
    private static final String PASS = "secret";
    private static final String HOME = "/ftp/stirling";
    // Passive FTP needs the data port pinned to a known host port, so pick two free ones up front
    // (rather than hard-coding) to avoid clashing with anything else on a CI runner.
    private static final int CONTROL_PORT;
    private static final int PASSIVE_PORT;

    static {
        try (java.net.ServerSocket control = new java.net.ServerSocket(0);
                java.net.ServerSocket passive = new java.net.ServerSocket(0)) {
            CONTROL_PORT = control.getLocalPort();
            PASSIVE_PORT = passive.getLocalPort();
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    @org.testcontainers.junit.jupiter.Container
    static GenericContainer<?> ftp =
            new FixedHostPortGenericContainer<>("delfer/alpine-ftp-server:latest")
                    .withFixedExposedPort(CONTROL_PORT, 21)
                    .withFixedExposedPort(PASSIVE_PORT, PASSIVE_PORT)
                    .withEnv("USERS", USER + "|" + PASS + "|" + HOME + "|1000")
                    .withEnv("ADDRESS", "127.0.0.1")
                    .withEnv("MIN_PORT", String.valueOf(PASSIVE_PORT))
                    .withEnv("MAX_PORT", String.valueOf(PASSIVE_PORT))
                    .waitingFor(Wait.forListeningPort());

    private NetworkInputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
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
        put("doc.pdf", "hello ftp");

        List<ResolvedInput> work = source.resolve(spec(Map.of()), ctx);

        assertThat(work).hasSize(1);
        assertThat(read(work.get(0))).isEqualTo("hello ftp");
        assertThat(source.resolve(spec(Map.of()), ctx)).isEmpty();

        work.get(0).onComplete().accept(true);
        assertThat(exists("doc.pdf")).isFalse();
        assertThat(source.resolve(spec(Map.of()), ctx)).isEmpty();
    }

    @Test
    void aFailedFileStaysOnTheServer() throws Exception {
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
        assertThatThrownBy(() -> source.validate(new InputSpec("ftp", wrong)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cannot access");
    }

    private Map<String, Object> baseOptions() {
        Map<String, Object> options = new HashMap<>();
        options.put("protocol", "ftp");
        options.put("host", "127.0.0.1");
        options.put("port", String.valueOf(CONTROL_PORT));
        options.put("username", USER);
        options.put("password", PASS);
        return options;
    }

    private InputSpec spec(Map<String, Object> extra) {
        Map<String, Object> options = new HashMap<>(baseOptions());
        options.putAll(extra);
        return new InputSpec("ftp", options);
    }

    private void put(String name, String content) throws Exception {
        String path = HOME + "/" + name;
        exec("printf '%s' '" + content + "' > " + path + " && chown 1000 " + path);
    }

    private boolean exists(String name) throws Exception {
        return exec("test -f " + HOME + "/" + name + " && echo yes || echo no").contains("yes");
    }

    private String exec(String script) throws Exception {
        Container.ExecResult result = ftp.execInContainer("sh", "-c", script);
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
