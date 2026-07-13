package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.s3.S3Config;
import stirling.software.proprietary.policy.s3.S3ConnectionPool;
import stirling.software.proprietary.policy.s3.S3Identities;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * Uploads a run's outputs to the bucket and key prefix given in the {@link OutputSpec} (same
 * connection options as the S3 input source; "prefix" is the destination folder). The
 * record-before-visible obligation is met without a rename step: a single-part PUT's ETag is the
 * MD5 of its content on plain and SSE-S3 buckets, so the ledger row is recorded at that predicted
 * gate BEFORE the upload, and the object is claimed under exactly the gate the next listing
 * returns. Stores where the returned ETag differs (e.g. SSE-KMS) are re-recorded at the actual gate
 * immediately after the PUT - a narrow race those buckets accept rather than a broken loop. Names
 * never overwrite: uploads are conditional on the key not existing ({@code If-None-Match: *}),
 * re-picking "name (n).ext" on collision exactly like the folder sink; stores without
 * conditional-write support fall back to an existence check per candidate.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class S3OutputSink implements PolicyOutputSink {

    private static final String TYPE = "s3";

    private final S3ConnectionPool connectionPool;
    private final ProcessedLedger processedLedger;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(OutputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    /**
     * Config shape and endpoint guard only - no network probe, since write-only credentials
     * (s3:PutObject without s3:ListBucket) are a legitimate setup for an output bucket and a
     * listing probe would wrongly reject them.
     */
    @Override
    public void validate(OutputSpec spec) {
        connectionPool.clientFor(S3Config.from(spec.options()));
    }

    @Override
    public List<ResultFile> deliver(
            OutputDelivery delivery, List<Resource> outputs, OutputSpec spec) throws IOException {
        S3Config config = S3Config.from(spec.options());
        S3Client client = connectionPool.clientFor(config);

        List<ResultFile> results = new ArrayList<>();
        for (int i = 0; i < outputs.size(); i++) {
            Resource resource = outputs.get(i);
            String name = OutputNames.safeName(resource.getFilename(), i);
            Path staged = Files.createTempFile("s3-output-", ".tmp");
            try {
                String predictedGate = stage(resource, staged, delivery.policyId() != null);
                long size = Files.size(staged);
                String key = upload(delivery, client, config, name, staged, predictedGate);
                String contentType =
                        MediaTypeFactory.getMediaType(name)
                                .orElse(MediaType.APPLICATION_OCTET_STREAM)
                                .toString();
                results.add(
                        ResultFile.builder()
                                .fileId(UUID.randomUUID().toString())
                                .fileName(S3Identities.identity(config.bucket(), key))
                                .contentType(contentType)
                                .fileSize(size)
                                .build());
                log.debug(
                        "Wrote policy run {} output to {}",
                        delivery.runId(),
                        S3Identities.identity(config.bucket(), key));
            } finally {
                try {
                    Files.deleteIfExists(staged);
                } catch (IOException e) {
                    log.warn("Could not remove S3 staging file {}: {}", staged, e.getMessage());
                }
            }
        }
        return results;
    }

    /**
     * Spool the output to a local staging file (S3 needs a known content length, and the body must
     * be re-readable across collision retries). For a recorded delivery the MD5 - the predicted
     * single-part ETag - is digested in the same pass; ad-hoc runs record nothing and skip it.
     */
    private static String stage(Resource resource, Path staged, boolean recorded)
            throws IOException {
        if (!recorded) {
            try (InputStream is = resource.getInputStream();
                    OutputStream out = Files.newOutputStream(staged)) {
                is.transferTo(out);
            }
            return null;
        }
        MessageDigest digest = newMd5();
        try (InputStream is = resource.getInputStream();
                DigestOutputStream out =
                        new DigestOutputStream(Files.newOutputStream(staged), digest)) {
            is.transferTo(out);
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    /**
     * The S3 shape of the folder sink's record-then-rename loop. The ledger row must exist before
     * the object is visible, so it is recorded at the predicted gate before the PUT; losing the
     * chosen key to a concurrent writer (the conditional PUT fails) forgets the just-recorded row -
     * whatever object actually owns that key must stay claimable at any version - then re-picks. A
     * PUT that never made the object visible also forgets its row.
     */
    private String upload(
            OutputDelivery delivery,
            S3Client client,
            S3Config config,
            String name,
            Path staged,
            String predictedGate)
            throws IOException {
        String keyPrefix = keyPrefix(config);
        boolean conditionalPuts = true;
        for (int attempt = 0; ; attempt++) {
            String key = keyPrefix + (attempt == 0 ? name : OutputNames.numbered(name, attempt));
            String identity = S3Identities.identity(config.bucket(), key);
            if (!conditionalPuts && exists(client, config.bucket(), key)) {
                continue;
            }
            if (delivery.policyId() != null) {
                processedLedger.recordOutput(delivery.policyId(), identity, predictedGate, null);
            }
            PutObjectRequest.Builder put =
                    PutObjectRequest.builder().bucket(config.bucket()).key(key);
            if (conditionalPuts) {
                put.ifNoneMatch("*");
            }
            try {
                PutObjectResponse response =
                        client.putObject(put.build(), RequestBody.fromFile(staged));
                reRecordIfGateDiffers(delivery, identity, predictedGate, response);
                return key;
            } catch (S3Exception e) {
                forgetRecorded(delivery, identity, predictedGate);
                if (conditionalPuts && e.statusCode() == 412) {
                    // Known edge: if our own PUT succeeded server-side but the response was lost
                    // and the SDK retried, that retry 412s here too - we then upload under the
                    // next name, leaving the first object row-less (claimable, single duplicate).
                    // Requires a response-lost network flake at exactly this moment; accepted.
                    log.debug("Output key {} taken concurrently; re-picking", identity);
                    continue;
                }
                if (conditionalPuts && e.statusCode() == 501) {
                    // Store without conditional-write support: retry this candidate with a plain
                    // existence check instead.
                    log.debug(
                            "Conditional PUT unsupported by {}; falling back to existence checks",
                            config.bucket());
                    conditionalPuts = false;
                    attempt--;
                    continue;
                }
                throw new IOException("Could not upload " + identity + ": " + e.getMessage(), e);
            } catch (SdkException e) {
                forgetRecorded(delivery, identity, predictedGate);
                throw new IOException("Could not upload " + identity + ": " + e.getMessage(), e);
            }
        }
    }

    /**
     * On buckets where a PUT's ETag is not the content MD5 (e.g. SSE-KMS), re-record at the gate
     * listings will actually return. The row is briefly at the wrong gate while the object is
     * already visible - the narrow race such stores trade for a working self-output skip.
     */
    private void reRecordIfGateDiffers(
            OutputDelivery delivery,
            String identity,
            String predictedGate,
            PutObjectResponse response) {
        if (delivery.policyId() == null) {
            return;
        }
        String actualGate = S3Identities.gate(response.eTag(), null, null);
        if (!actualGate.equals(predictedGate)) {
            log.debug(
                    "PUT ETag for {} differs from content MD5 (encrypted bucket?); re-recording",
                    identity);
            processedLedger.recordOutput(delivery.policyId(), identity, actualGate, null);
        }
    }

    private void forgetRecorded(OutputDelivery delivery, String identity, String predictedGate) {
        if (delivery.policyId() != null) {
            processedLedger.forgetOutput(delivery.policyId(), identity, predictedGate);
        }
    }

    private static boolean exists(S3Client client, String bucket, String key) {
        try {
            client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return false;
            }
            throw e;
        }
    }

    /** The configured prefix as a key-path prefix: "processed" and "processed/" mean the same. */
    private static String keyPrefix(S3Config config) {
        String prefix = config.prefix();
        if (prefix.isEmpty() || prefix.endsWith("/")) {
            return prefix;
        }
        return prefix + "/";
    }

    private static MessageDigest newMd5() {
        try {
            return MessageDigest.getInstance("MD5");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("MD5 unavailable", e);
        }
    }
}
