package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.remote.CloudDrive;
import stirling.software.proprietary.policy.remote.CloudFile;
import stirling.software.proprietary.policy.remote.CloudLocation;
import stirling.software.proprietary.policy.remote.ContentHasher;

@Slf4j
public abstract class CloudDriveOutputSink<L extends CloudLocation, F extends CloudFile>
        implements PolicyOutputSink {

    private final CloudDrive<L, F> drive;
    private final ProcessedLedger processedLedger;

    protected CloudDriveOutputSink(CloudDrive<L, F> drive, ProcessedLedger processedLedger) {
        this.drive = drive;
        this.processedLedger = processedLedger;
    }

    @Override
    public String type() {
        return drive.types().iterator().next();
    }

    @Override
    public boolean supports(OutputSpec spec) {
        return spec != null && drive.types().contains(spec.type());
    }

    @Override
    public void validate(OutputSpec spec) {
        try {
            drive.checkWritable(drive.resolve(spec.type(), spec.options()));
        } catch (IOException e) {
            throw new IllegalArgumentException(e.getMessage(), e);
        }
    }

    @Override
    public List<ResultFile> deliver(
            OutputDelivery delivery, List<Resource> outputs, OutputSpec spec) throws IOException {
        L location = drive.resolve(spec.type(), spec.options());
        List<ResultFile> results = new ArrayList<>();
        for (int i = 0; i < outputs.size(); i++) {
            Resource resource = outputs.get(i);
            String name = OutputNames.safeName(resource.getFilename(), i);
            Path staged = Files.createTempFile("cloud-output-", ".tmp");
            try {
                String gate = stage(resource, staged);
                F uploaded = upload(delivery, location, name, staged, gate);
                results.add(
                        ResultFile.builder()
                                .fileId(UUID.randomUUID().toString())
                                .fileName(uploaded.identity())
                                .contentType(
                                        MediaTypeFactory.getMediaType(uploaded.name())
                                                .orElse(MediaType.APPLICATION_OCTET_STREAM)
                                                .toString())
                                .fileSize(uploaded.size())
                                .build());
            } finally {
                try {
                    Files.deleteIfExists(staged);
                } catch (IOException e) {
                    log.warn("Could not remove staging file {}: {}", staged, e.getMessage());
                }
            }
        }
        return results;
    }

    private F upload(OutputDelivery delivery, L location, String name, Path staged, String gate)
            throws IOException {
        for (int attempt = 0; ; attempt++) {
            String candidate = attempt == 0 ? name : OutputNames.numbered(name, attempt);
            String identity = drive.outputIdentity(location, candidate);
            if (delivery.policyId() != null) {
                processedLedger.recordOutput(delivery.policyId(), identity, gate, null);
            }
            Optional<F> uploaded;
            try {
                uploaded = drive.upload(location, candidate, staged);
            } catch (IOException | RuntimeException e) {
                forget(delivery, identity, gate);
                throw e;
            }
            if (uploaded.isPresent()) {
                F file = uploaded.get();
                if (delivery.policyId() != null
                        && file.hasContentHash()
                        && !file.version().equals(gate)) {
                    processedLedger.recordOutput(
                            delivery.policyId(), identity, file.version(), null);
                }
                return file;
            }
            forget(delivery, identity, gate);
            log.debug("{} already exists; trying the next name", identity);
        }
    }

    private void forget(OutputDelivery delivery, String identity, String gate) {
        if (delivery.policyId() != null) {
            processedLedger.forgetOutput(delivery.policyId(), identity, gate);
        }
    }

    private String stage(Resource resource, Path staged) throws IOException {
        ContentHasher hasher = drive.newHasher();
        byte[] buffer = new byte[64 * 1024];
        try (InputStream in = resource.getInputStream();
                OutputStream out = Files.newOutputStream(staged)) {
            int read;
            while ((read = in.read(buffer)) != -1) {
                hasher.update(buffer, 0, read);
                out.write(buffer, 0, read);
            }
        }
        return hasher.gate();
    }
}
