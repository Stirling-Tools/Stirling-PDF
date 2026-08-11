package stirling.software.proprietary.policy.network;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.access.service.OwnershipService;
import stirling.software.proprietary.integration.repository.IntegrationConfigRepository;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.security.service.UserService;

/**
 * Tests for {@link NetworkInputSource}: consume mode tracks remote files through the ledger, the
 * version-guarded delete survives a mid-run replacement, a shared file is removed only once every
 * policy is done, snapshot stays stateless, and the source type must match the connection protocol.
 * The remote server is faked in memory, so no real SFTP/FTP/SMB endpoint is needed.
 */
class NetworkInputSourceTest {

    private static final String POLICY = "p1";

    private FakeServer server;
    private NetworkInputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
        server = new FakeServer();
        // allowPrivate=true so the host guard never resolves DNS; connect() is overridden anyway.
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowPrivateNetworkSources(true);
        RemoteFileClientFactory factory = new RemoteFileClientFactory(new NetworkHostGuard(properties)) {
            @Override
            public RemoteFileClient connect(NetworkConfig config) {
                return new FakeClient(server);
            }
        };
        NetworkConnectionResolver resolver = new NetworkConnectionResolver(
                mock(IntegrationConfigRepository.class), mock(OwnershipService.class), mock(UserService.class));
        source = new NetworkInputSource(resolver, factory);
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
    }

    private static InputSpec sftp(Map<String, Object> extra) {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("protocol", "sftp");
        options.put("host", "files.example.com");
        options.put("username", "u");
        options.put("password", "p");
        options.put("directory", "in");
        options.putAll(extra);
        return new InputSpec("sftp", options);
    }

    @Test
    void supportsTheThreeNetworkSourceTypes() {
        assertTrue(source.supports(new InputSpec("sftp", Map.of())));
        assertTrue(source.supports(new InputSpec("ftp", Map.of())));
        assertTrue(source.supports(new InputSpec("network", Map.of())));
        assertFalse(source.supports(new InputSpec("folder", Map.of())));
    }

    @Test
    void consumeRemovesTheFileOnceProcessed() throws Exception {
        server.put("in/doc.pdf", "data", 1000);

        List<ResolvedInput> work = source.resolve(sftp(Map.of()), ctx);

        assertEquals(1, work.size());
        assertEquals(1, work.get(0).inputs().primary().size());
        // In flight: still on the server, but a second sweep does not pick it up again.
        assertTrue(server.has("in/doc.pdf"));
        assertTrue(source.resolve(sftp(Map.of()), ctx).isEmpty());

        work.get(0).onComplete().accept(true);
        assertFalse(server.has("in/doc.pdf"));
        assertTrue(source.resolve(sftp(Map.of()), ctx).isEmpty());
    }

    @Test
    void aFileReplacedMidRunSurvivesTheDeleteAndRunsAgain() throws Exception {
        server.put("in/doc.pdf", "data", 1000);

        List<ResolvedInput> work = source.resolve(sftp(Map.of()), ctx);
        // A new version lands while the run is executing (different size/mtime = new gate).
        server.put("in/doc.pdf", "new data, different size", 2000);
        work.get(0).onComplete().accept(true);

        // The delete is version-guarded: the replacement is not the file that ran, so it stays and
        // is claimed as fresh work next sweep.
        assertTrue(server.has("in/doc.pdf"));
        assertEquals(1, source.resolve(sftp(Map.of()), ctx).size());
    }

    @Test
    void aSharedFileIsRemovedOnlyOnceEveryPolicyHasProcessedIt() throws Exception {
        server.put("in/doc.pdf", "data", 1000);
        RecordingContext other = new RecordingContext("p2");

        List<ResolvedInput> mine = source.resolve(sftp(Map.of()), ctx);
        List<ResolvedInput> theirs = source.resolve(sftp(Map.of()), other);
        assertEquals(1, mine.size());
        assertEquals(1, theirs.size());

        mine.get(0).onComplete().accept(true);
        assertTrue(server.has("in/doc.pdf")); // the other claim is still in flight

        theirs.get(0).onComplete().accept(true);
        assertFalse(server.has("in/doc.pdf"));
    }

    @Test
    void aFailedFileStaysInPlaceAndIsNotRetriedUntilItChanges() throws Exception {
        server.put("in/doc.pdf", "data", 1000);

        source.resolve(sftp(Map.of()), ctx).get(0).onComplete().accept(false);

        assertTrue(server.has("in/doc.pdf"));
        assertTrue(source.resolve(sftp(Map.of()), ctx).isEmpty());

        server.put("in/doc.pdf", "data", 2000); // touched: new mtime is a new version
        assertEquals(1, source.resolve(sftp(Map.of()), ctx).size());
    }

    @Test
    void snapshotReadsStatelesslyEverySweep() throws Exception {
        server.put("in/doc.pdf", "data", 1000);
        InputSpec spec = sftp(Map.of("mode", "snapshot"));

        List<ResolvedInput> first = source.resolve(spec, ctx);
        first.get(0).onComplete().accept(true);
        List<ResolvedInput> second = source.resolve(spec, ctx);

        assertEquals(1, first.size());
        assertEquals(1, second.size()); // no ledger involvement
        assertTrue(ctx.present.isEmpty());
        assertTrue(server.has("in/doc.pdf"));
    }

    @Test
    void streamsTheFileContent() throws Exception {
        server.put("in/doc.pdf", "hello", 1000);

        List<ResolvedInput> work = source.resolve(sftp(Map.of()), ctx);
        try (InputStream in = work.get(0).inputs().primary().get(0).getInputStream()) {
            assertEquals("hello", new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    @Test
    void validateRejectsASourceTypeThatDoesNotMatchTheConnectionProtocol() {
        // A "network" (SMB) source pointed at an SFTP connection is a misconfiguration.
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("protocol", "sftp");
        options.put("host", "files.example.com");
        options.put("username", "u");
        options.put("password", "p");
        assertThrows(IllegalArgumentException.class, () -> source.validate(new InputSpec("network", options)));
    }

    /** In-memory remote server shared between a test's fake clients. */
    private static final class FakeServer {
        private final Map<String, FakeFile> files = new LinkedHashMap<>();

        void put(String path, String content, long mtime) {
            files.put(path, new FakeFile(content.getBytes(StandardCharsets.UTF_8), mtime));
        }

        boolean has(String path) {
            return files.containsKey(path);
        }
    }

    private record FakeFile(byte[] content, long mtime) {}

    /** A RemoteFileClient over the in-memory server; every op reads/writes the shared map. */
    private static final class FakeClient implements RemoteFileClient {
        private final FakeServer server;

        private FakeClient(FakeServer server) {
            this.server = server;
        }

        @Override
        public List<RemoteFile> list(String directory, boolean recursive) {
            List<RemoteFile> out = new ArrayList<>();
            server.files.forEach((path, file) -> {
                String name = path.substring(path.lastIndexOf('/') + 1);
                out.add(new RemoteFile(path, name, file.content().length, file.mtime()));
            });
            return out;
        }

        @Override
        public RemoteFile stat(String path) {
            FakeFile file = server.files.get(path);
            if (file == null) {
                return null;
            }
            String name = path.substring(path.lastIndexOf('/') + 1);
            return new RemoteFile(path, name, file.content().length, file.mtime());
        }

        @Override
        public InputStream open(String path) {
            return new ByteArrayInputStream(server.files.get(path).content());
        }

        @Override
        public void delete(String path) {
            server.files.remove(path);
        }

        @Override
        public void close() {}
    }

    /** Policy-scoped context backed by the in-process ledger, recording presence reports. */
    private final class RecordingContext implements ResolveContext {
        private final String policyId;
        private final List<String> present = new ArrayList<>();

        private RecordingContext() {
            this(POLICY);
        }

        private RecordingContext(String policyId) {
            this.policyId = policyId;
        }

        @Override
        public boolean claim(String identity, String gate, Supplier<String> contentHash) {
            return ledger.claim(policyId, identity, gate, contentHash);
        }

        @Override
        public void settle(String identity, String finalGate, String finalContentHash, boolean success) {
            ledger.settle(policyId, identity, finalGate, finalContentHash, success);
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
