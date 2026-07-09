package stirling.software.proprietary.policy.input;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.s3.S3Config;
import stirling.software.proprietary.policy.s3.S3ConnectionPool;
import stirling.software.proprietary.policy.s3.S3Identities;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.S3Object;

/**
 * Reads input files from an Amazon S3 (or S3-compatible) bucket; each listed object is its own unit
 * of work, claimed through the {@link ResolveContext} ledger and tracked in place. Identity and
 * version gate come from {@link S3Identities}, so the steady-state sweep never downloads content.
 * Options (see {@link S3Config}): "bucket" (required), "region" (default us-east-1), "prefix" (only
 * keys starting with it are read), "endpoint" (S3-compatible stores such as MinIO; path-style
 * addressing is used automatically), "accessKeyId" and "secretAccessKey" (both or neither; when
 * absent the server's own AWS credential chain is used), and "mode" which is "consume" (default: a
 * processed object is deleted once every policy that claimed it has settled successfully and it is
 * still the version that ran; failures stay in place and are not retried until they change) or
 * "snapshot" (stateless, every run sees the full set). Keys ending in "/" (folder placeholders) and
 * keys with a dot-prefixed path segment are never picked up, mirroring the folder source's
 * hidden-file rule.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class S3InputSource implements InputSource {

    private static final String TYPE = "s3";

    private final S3ConnectionPool connectionPool;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(InputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    /**
     * Fails fast at save time: bad config shape, a private endpoint without the operator opt-in, or
     * a bucket the supplied credentials cannot list.
     */
    @Override
    public void validate(InputSpec spec) {
        S3Config config = S3Config.from(spec.options());
        try {
            connectionPool.clientFor(config).listObjectsV2(listRequest(config).maxKeys(1).build());
        } catch (SdkException e) {
            throw new IllegalArgumentException(
                    "cannot access s3://"
                            + config.bucket()
                            + "/"
                            + config.prefix()
                            + ": "
                            + e.getMessage(),
                    e);
        }
    }

    @Override
    public List<ResolvedInput> resolve(InputSpec spec, ResolveContext ctx) throws IOException {
        S3Config config = S3Config.from(spec.options());
        S3Client client = connectionPool.clientFor(config);
        // A listing failure propagates so the sweep reads it as "could not list" (which vetoes
        // presence cleanup), never as "verifiably no objects".
        List<S3Object> objects = listObjects(client, config);

        if (config.snapshot()) {
            return objects.stream()
                    .map(
                            object ->
                                    ResolvedInput.of(
                                            PolicyInputs.of(
                                                    List.of(
                                                            objectResource(
                                                                    client, config, object)))))
                    .toList();
        }

        ctx.reportPresent(
                objects.stream()
                        .map(object -> S3Identities.identity(config.bucket(), object.key()))
                        .toList());

        List<ResolvedInput> work = new ArrayList<>();
        for (S3Object object : objects) {
            String identity = S3Identities.identity(config.bucket(), object.key());
            String gate = S3Identities.gate(object.eTag(), object.size(), object.lastModified());
            if (!ctx.claim(identity, gate, null)) {
                continue;
            }
            work.add(
                    new ResolvedInput(
                            PolicyInputs.of(List.of(objectResource(client, config, object))),
                            success ->
                                    completeConsumed(
                                            ctx,
                                            client,
                                            config,
                                            object.key(),
                                            identity,
                                            gate,
                                            success)));
        }
        return work;
    }

    /**
     * Settle at the version this run claimed, then remove the object only when it still carries
     * that version and every policy that claimed it has settled DONE, mirroring the folder source's
     * consensus delete. A failed run settles ERROR and never deletes; the DONE row of an object
     * that could not be deleted still stops reprocessing.
     */
    private void completeConsumed(
            ResolveContext ctx,
            S3Client client,
            S3Config config,
            String key,
            String identity,
            String claimGate,
            boolean success) {
        ctx.settle(identity, claimGate, null, success);
        if (!success) {
            return;
        }
        try {
            HeadObjectResponse head =
                    client.headObject(
                            HeadObjectRequest.builder().bucket(config.bucket()).key(key).build());
            String currentGate =
                    S3Identities.gate(head.eTag(), head.contentLength(), head.lastModified());
            if (currentGate.equals(claimGate) && ctx.allSettledDone(identity)) {
                client.deleteObject(
                        DeleteObjectRequest.builder().bucket(config.bucket()).key(key).build());
            }
        } catch (NoSuchKeyException alreadyGone) {
            // Removed by the user or a co-watching policy's own consensus delete: nothing to do.
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                return;
            }
            log.warn("Could not remove consumed S3 object {}: {}", identity, e.getMessage());
        } catch (SdkException e) {
            log.warn("Could not remove consumed S3 object {}: {}", identity, e.getMessage());
        }
    }

    /** Every ingestible object under the configured prefix, across all listing pages. */
    private static List<S3Object> listObjects(S3Client client, S3Config config) {
        List<S3Object> objects = new ArrayList<>();
        String continuationToken = null;
        do {
            ListObjectsV2Request.Builder request = listRequest(config);
            if (continuationToken != null) {
                request.continuationToken(continuationToken);
            }
            ListObjectsV2Response page = client.listObjectsV2(request.build());
            for (S3Object object : page.contents()) {
                if (ingestible(object)) {
                    objects.add(object);
                }
            }
            continuationToken = page.nextContinuationToken();
        } while (continuationToken != null);
        return objects;
    }

    private static ListObjectsV2Request.Builder listRequest(S3Config config) {
        ListObjectsV2Request.Builder request =
                ListObjectsV2Request.builder().bucket(config.bucket());
        if (!config.prefix().isEmpty()) {
            request.prefix(config.prefix());
        }
        return request;
    }

    /**
     * Folder-placeholder keys (ending "/") and keys with a dot-prefixed segment are skipped, so a
     * hidden convention (e.g. a future output sink's staging prefix) is never re-ingested.
     */
    private static boolean ingestible(S3Object object) {
        String key = object.key();
        if (key.isEmpty() || key.endsWith("/")) {
            return false;
        }
        for (String segment : key.split("/")) {
            if (segment.startsWith(".")) {
                return false;
            }
        }
        return true;
    }

    private static Resource objectResource(S3Client client, S3Config config, S3Object object) {
        return new S3ObjectResource(client, config.bucket(), object);
    }

    /**
     * Streams the object on demand, pinned to the ETag observed at listing time so a run never
     * reads a different version than the sweep claimed (a swapped object fails the read with a
     * precondition error and the new version is claimed by a later sweep).
     */
    private static final class S3ObjectResource extends AbstractResource {

        private final S3Client client;
        private final String bucket;
        private final String key;
        private final String eTag;
        private final Long size;

        private S3ObjectResource(S3Client client, String bucket, S3Object object) {
            this.client = client;
            this.bucket = bucket;
            this.key = object.key();
            this.eTag = object.eTag();
            this.size = object.size();
        }

        @Override
        public InputStream getInputStream() throws IOException {
            GetObjectRequest.Builder request = GetObjectRequest.builder().bucket(bucket).key(key);
            if (eTag != null && !eTag.isBlank()) {
                request.ifMatch(eTag);
            }
            try {
                return client.getObject(request.build());
            } catch (NoSuchKeyException e) {
                throw new FileNotFoundException(getDescription() + " no longer exists");
            } catch (SdkException e) {
                throw new IOException(
                        "Could not read " + getDescription() + ": " + e.getMessage(), e);
            }
        }

        /** Listed just now; readers get a precise error from {@link #getInputStream} instead. */
        @Override
        public boolean exists() {
            return true;
        }

        @Override
        public long contentLength() {
            return size == null ? -1 : size;
        }

        @Override
        public String getFilename() {
            return key.substring(key.lastIndexOf('/') + 1);
        }

        @Override
        public String getDescription() {
            return "S3 object " + S3Identities.identity(bucket, key);
        }
    }
}
