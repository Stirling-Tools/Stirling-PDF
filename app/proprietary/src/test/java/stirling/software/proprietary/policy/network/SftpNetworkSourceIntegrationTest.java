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
 * End-to-end {@link NetworkInputSource} test over SFTP against a real atmoz/sftp server, through
 * the production {@link SftpFileClient}: listing, claiming, streaming the actual bytes, consume
 * delete, and save-time validation. The server chroots the user to its home; {@code upload} is the
 * writable drop folder.
 */
@Testcontainers(disabledWithoutDocker = true)
class SftpNetworkSourceIntegrationTest {

    private static final String POLICY = "p1";
    private static final String USER = "stirling";
    private static final String PASS = "secret";
    private static final String DIR = "upload";
    private static final int SFTP_PORT = 22;

    @org.testcontainers.junit.jupiter.Container
    static GenericContainer<?> sftp =
            new GenericContainer<>("atmoz/sftp:alpine")
                    .withExposedPorts(SFTP_PORT)
                    .withCommand(USER + ":" + PASS + ":::" + DIR)
                    .waitingFor(Wait.forListeningPort());

    private NetworkInputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
        // The container resolves to loopback, so the private-host opt-in must be on.
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
        put("doc.pdf", "hello sftp");

        List<ResolvedInput> work = source.resolve(spec(Map.of()), ctx);

        assertThat(work).hasSize(1);
        String identity =
                "sftp://"
                        + sftp.getHost()
                        + ":"
                        + sftp.getMappedPort(SFTP_PORT)
                        + "/upload/doc.pdf";
        assertThat(ctx.present).containsExactly(identity);
        assertThat(read(work.get(0))).isEqualTo("hello sftp");
        // In flight: a second sweep does not re-claim it.
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
        assertThatThrownBy(() -> source.validate(new InputSpec("sftp", wrong)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cannot access");
    }

    private Map<String, Object> baseOptions() {
        Map<String, Object> options = new HashMap<>();
        options.put("protocol", "sftp");
        options.put("host", sftp.getHost());
        options.put("port", String.valueOf(sftp.getMappedPort(SFTP_PORT)));
        options.put("username", USER);
        options.put("password", PASS);
        options.put("directory", DIR);
        return options;
    }

    private InputSpec spec(Map<String, Object> extra) {
        Map<String, Object> options = new HashMap<>(baseOptions());
        options.putAll(extra);
        return new InputSpec("sftp", options);
    }

    private void put(String name, String content) throws Exception {
        String path = "/home/" + USER + "/" + DIR + "/" + name;
        exec("printf '%s' '" + content + "' > " + path + " && chmod 644 " + path);
    }

    private boolean exists(String name) throws Exception {
        return exec("test -f /home/" + USER + "/" + DIR + "/" + name + " && echo yes || echo no")
                .contains("yes");
    }

    private String exec(String script) throws Exception {
        Container.ExecResult result = sftp.execInContainer("sh", "-c", script);
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
