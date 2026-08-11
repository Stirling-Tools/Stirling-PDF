package stirling.software.proprietary.policy.network;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * Reads input files from a network file server (SFTP, FTP/FTPS, or SMB), one bean serving all three
 * source types ({@code sftp}, {@code ftp}, {@code network}); the protocol comes from the referenced
 * connection. Each listed file is its own unit of work, claimed through the {@link ResolveContext}
 * ledger and tracked in place, mirroring the S3 source. The version gate is size + last-modified
 * (there is no ETag), so this has folder-source "stat" strength. Options: "connectionId" references
 * the stored NETWORK connection; "directory" is the poll folder (relative to the login home or
 * share root); "recursive" descends into subdirectories; "mode" is "consume" (default: a processed
 * file is deleted once every policy that claimed it has settled successfully and it is still the
 * version that ran) or "snapshot" (stateless, every run sees the full set).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NetworkInputSource implements InputSource {

    private final NetworkConnectionResolver connectionResolver;
    private final RemoteFileClientFactory clientFactory;

    @Override
    public String type() {
        return NetworkProtocol.SMB.sourceType();
    }

    @Override
    public boolean supports(InputSpec spec) {
        return spec != null && NetworkProtocol.forSourceType(spec.type()) != null;
    }

    /**
     * Fails fast at save time: an unknown/disabled/inaccessible connection, a protocol that does
     * not match the source type, a blocked host, or a server the connection cannot list.
     */
    @Override
    public void validate(InputSpec spec) {
        NetworkConfig config = connectionResolver.resolve(spec.options());
        NetworkProtocol expected = NetworkProtocol.forSourceType(spec.type());
        if (expected != null && config.protocol() != expected) {
            throw new IllegalArgumentException(
                    "source type '" + spec.type() + "' does not match the connection protocol " + config.protocol());
        }
        try (RemoteFileClient client = clientFactory.connect(config)) {
            client.list(config.directory(), false);
        } catch (IOException e) {
            throw new IllegalArgumentException("cannot access " + config.protocol() + " source: " + e.getMessage(), e);
        }
    }

    @Override
    public List<ResolvedInput> resolve(InputSpec spec, ResolveContext ctx) throws IOException {
        NetworkConfig config = connectionResolver.resolve(spec.options());
        // A listing failure propagates so the sweep reads it as "could not list" (which vetoes
        // presence cleanup), never as "verifiably no files".
        List<RemoteFile> files;
        try (RemoteFileClient client = clientFactory.connect(config)) {
            files = client.list(config.directory(), config.recursive());
        }
        if (files.size() >= RemoteFileClient.MAX_FILES) {
            log.warn(
                    "Network source listing hit the {}-file cap; remaining files are picked up" + " on later sweeps",
                    RemoteFileClient.MAX_FILES);
        }

        if (config.snapshot()) {
            return files.stream()
                    .map(file -> ResolvedInput.of(PolicyInputs.of(List.of(resource(config, file)))))
                    .toList();
        }

        ctx.reportPresent(files.stream()
                .map(file -> NetworkIdentities.identity(config, file.path()))
                .toList());

        List<ResolvedInput> work = new ArrayList<>();
        for (RemoteFile file : files) {
            String identity = NetworkIdentities.identity(config, file.path());
            String gate = NetworkIdentities.gate(file.size(), file.lastModifiedMs());
            if (!ctx.claim(identity, gate, null)) {
                continue;
            }
            work.add(new ResolvedInput(
                    PolicyInputs.of(List.of(resource(config, file))),
                    success -> completeConsumed(ctx, config, file, identity, gate, success)));
        }
        return work;
    }

    /**
     * Settle at the version this run claimed, then remove the file only when it still carries that
     * version and every policy that claimed it has settled DONE, mirroring the S3 source's
     * consensus delete. A failed run settles ERROR and never deletes; the DONE row of a file that
     * could not be deleted still stops reprocessing.
     */
    private void completeConsumed(
            ResolveContext ctx,
            NetworkConfig config,
            RemoteFile file,
            String identity,
            String claimGate,
            boolean success) {
        ctx.settle(identity, claimGate, null, success);
        if (!success) {
            return;
        }
        try (RemoteFileClient client = clientFactory.connect(config)) {
            RemoteFile current = client.stat(file.path());
            if (current == null) {
                return; // removed by the user or a co-watching policy's consensus delete
            }
            String currentGate = NetworkIdentities.gate(current.size(), current.lastModifiedMs());
            if (currentGate.equals(claimGate) && ctx.allSettledDone(identity)) {
                client.delete(file.path());
            }
        } catch (IOException e) {
            log.warn("Could not remove consumed network file {}: {}", identity, e.getMessage());
        }
    }

    private Resource resource(NetworkConfig config, RemoteFile file) {
        return new RemoteFileResource(clientFactory, config, file);
    }
}
