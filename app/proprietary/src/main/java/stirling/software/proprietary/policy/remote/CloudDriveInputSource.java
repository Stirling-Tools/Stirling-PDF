package stirling.software.proprietary.policy.remote;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.Resource;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.source.Source;

/**
 * Reads input files from any {@link CloudDrive}. Each listed file is its own unit of work, claimed
 * through the {@link ResolveContext} ledger. Option "mode" is "consume" (default: a processed file
 * is removed once every policy that claimed it has settled successfully and it is still the version
 * that ran), "track" (keep originals, process each version once) or "snapshot" (stateless, every
 * run sees every file).
 */
@Slf4j
public abstract class CloudDriveInputSource<L extends CloudLocation, F extends CloudFile>
        implements InputSource {

    /** Listing cap shared by the cloud drives; consume mode drains the rest on later sweeps. */
    public static final int MAX_FILES = 10_000;

    private final CloudDrive<L, F> drive;

    protected CloudDriveInputSource(CloudDrive<L, F> drive) {
        this.drive = drive;
    }

    @Override
    public String type() {
        return drive.types().iterator().next();
    }

    @Override
    public boolean supports(InputSpec spec) {
        return spec != null && drive.types().contains(spec.type());
    }

    @Override
    public void validate(InputSpec spec) {
        L location = drive.resolve(spec.type(), spec.options());
        try {
            drive.checkReadable(location);
        } catch (IOException e) {
            throw new IllegalArgumentException(e.getMessage(), e);
        }
    }

    @Override
    public List<ResolvedInput> resolve(Source source, ResolveContext ctx, String policyOwner)
            throws IOException {
        return resolve(source.toInputSpec(), ctx);
    }

    @Override
    public List<ResolvedInput> resolve(InputSpec spec, ResolveContext ctx) throws IOException {
        L location = drive.resolve(spec.type(), spec.options());
        List<F> files = drive.list(location);
        if (files.size() >= MAX_FILES) {
            log.warn(
                    "{} listing of {} hit the {}-file cap; the rest are picked up later",
                    drive.label(),
                    location.location(),
                    MAX_FILES);
        }
        if (location.snapshot()) {
            return files.stream()
                    .map(
                            file ->
                                    ResolvedInput.of(
                                            PolicyInputs.of(List.of(resource(location, file)))))
                    .toList();
        }
        ctx.reportPresent(files.stream().map(CloudFile::identity).toList());
        boolean track = "track".equals(String.valueOf(spec.options().get("mode")).trim());
        List<ResolvedInput> work = new ArrayList<>();
        for (F file : files) {
            String gate = file.version();
            if (!ctx.claim(file.identity(), gate, null)) {
                continue;
            }
            work.add(
                    ResolvedInput.forFile(
                            PolicyInputs.of(List.of(resource(location, file))),
                            file.identity(),
                            success -> complete(ctx, location, file, gate, success, track)));
        }
        return work;
    }

    /**
     * Settles at the claimed version, then removes the file only once every claiming policy is done
     * and it still carries that version; the drive's own conditional remove closes the remaining
     * window where it can.
     */
    private void complete(
            ResolveContext ctx,
            L location,
            F file,
            String claimGate,
            boolean success,
            boolean track) {
        ctx.settle(file.identity(), claimGate, null, success);
        if (!success || track) {
            return;
        }
        try {
            Optional<F> current = drive.stat(location, file);
            if (current.isEmpty()
                    || !current.get().version().equals(claimGate)
                    || !ctx.allSettledDone(file.identity())) {
                return;
            }
            if (!drive.remove(location, current.get())) {
                log.debug("{} changed before it could be consumed; keeping it", file.identity());
            }
        } catch (IOException e) {
            log.warn("Could not remove consumed file {}: {}", file.identity(), e.getMessage());
        }
    }

    private Resource resource(L location, F file) {
        return new CloudFileResource<>(drive, location, file);
    }

    /** A listed file streamed on demand; size and name come from the listing. */
    private static final class CloudFileResource<L extends CloudLocation, F extends CloudFile>
            extends AbstractResource {

        private final CloudDrive<L, F> drive;
        private final L location;
        private final F file;

        CloudFileResource(CloudDrive<L, F> drive, L location, F file) {
            this.drive = drive;
            this.location = location;
            this.file = file;
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return drive.open(location, file);
        }

        @Override
        public boolean exists() {
            return true;
        }

        @Override
        public long contentLength() {
            return file.size();
        }

        @Override
        public String getFilename() {
            return file.name();
        }

        @Override
        public String getDescription() {
            return drive.label() + " file " + file.identity();
        }
    }
}
