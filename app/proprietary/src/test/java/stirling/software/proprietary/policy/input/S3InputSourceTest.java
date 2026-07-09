package stirling.software.proprietary.policy.input;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.s3.S3ConnectionPool;

import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.S3Object;

/**
 * Tests for {@link S3InputSource}: consume mode tracks objects in place through the ledger and
 * removes them by consensus, snapshot stays stateless, and discovery skips folder placeholders and
 * dot-prefixed keys.
 */
@ExtendWith(MockitoExtension.class)
class S3InputSourceTest {

    private static final String POLICY = "p1";
    private static final String BUCKET = "inbox-bucket";

    @Mock private S3Client s3Client;

    private S3InputSource source;
    private InProcessProcessedLedger ledger;
    private RecordingContext ctx;

    @BeforeEach
    void setUp() {
        source =
                new S3InputSource(
                        new S3ConnectionPool(new ApplicationProperties(), config -> s3Client));
        ledger = new InProcessProcessedLedger();
        ctx = new RecordingContext();
    }

    @Test
    void consumeRemovesTheObjectOnceProcessed() throws IOException {
        listingReturns(object("doc.pdf", "\"etag-1\""));
        headReturns("doc.pdf", "\"etag-1\"");

        List<ResolvedInput> work = source.resolve(spec(), ctx);

        assertEquals(1, work.size());
        assertEquals(1, work.get(0).inputs().primary().size());
        // In flight: a second sweep does not pick it up again.
        assertTrue(source.resolve(spec(), ctx).isEmpty());

        work.get(0).onComplete().accept(true);
        verify(s3Client).deleteObject(any(DeleteObjectRequest.class));
        assertTrue(source.resolve(spec(), ctx).isEmpty());
    }

    @Test
    void anObjectReplacedMidRunSurvivesTheDelete() throws IOException {
        listingReturns(object("doc.pdf", "\"etag-1\""));
        // The object is overwritten while the run is executing.
        headReturns("doc.pdf", "\"etag-2\"");

        List<ResolvedInput> work = source.resolve(spec(), ctx);
        work.get(0).onComplete().accept(true);

        // The delete is version-guarded: the replacement is not the object that ran, so it stays
        // and is claimed as fresh work instead of being marked processed.
        verify(s3Client, never()).deleteObject(any(DeleteObjectRequest.class));
        listingReturns(object("doc.pdf", "\"etag-2\""));
        assertEquals(1, source.resolve(spec(), ctx).size());
    }

    @Test
    void aSharedObjectIsRemovedOnlyOnceEveryPolicyHasProcessedIt() throws IOException {
        listingReturns(object("doc.pdf", "\"etag-1\""));
        headReturns("doc.pdf", "\"etag-1\"");
        RecordingContext other = new RecordingContext("p2");

        List<ResolvedInput> mine = source.resolve(spec(), ctx);
        List<ResolvedInput> theirs = source.resolve(spec(), other);
        assertEquals(1, mine.size());
        assertEquals(1, theirs.size());

        mine.get(0).onComplete().accept(true);
        // The other policy's claim is still in flight, so the first finisher must not delete.
        verify(s3Client, never()).deleteObject(any(DeleteObjectRequest.class));

        theirs.get(0).onComplete().accept(true);
        verify(s3Client).deleteObject(any(DeleteObjectRequest.class));
    }

    @Test
    void aFailedObjectStaysAndIsNotRetriedUntilItChanges() throws IOException {
        listingReturns(object("doc.pdf", "\"etag-1\""));

        source.resolve(spec(), ctx).get(0).onComplete().accept(false);

        verify(s3Client, never()).deleteObject(any(DeleteObjectRequest.class));
        assertTrue(source.resolve(spec(), ctx).isEmpty());

        // A new upload carries a new ETag, which reads as a new version and retries.
        listingReturns(object("doc.pdf", "\"etag-2\""));
        assertEquals(1, source.resolve(spec(), ctx).size());
    }

    @Test
    void snapshotReadsStatelesslyEverySweep() throws IOException {
        listingReturns(object("doc.pdf", "\"etag-1\""));
        InputSpec spec = new InputSpec("s3", Map.of("bucket", BUCKET, "mode", "snapshot"));

        List<ResolvedInput> first = source.resolve(spec, ctx);
        first.get(0).onComplete().accept(true);
        List<ResolvedInput> second = source.resolve(spec, ctx);

        assertEquals(1, first.size());
        assertEquals(1, second.size());
        verify(s3Client, never()).deleteObject(any(DeleteObjectRequest.class));
        assertTrue(ctx.present.isEmpty());
    }

    @Test
    void folderPlaceholdersAndDotPrefixedKeysAreSkipped() throws IOException {
        listingReturns(
                object("doc.pdf", "\"etag-1\""),
                object("incoming/", "\"etag-2\""),
                object(".stirling/tmp/staged.pdf", "\"etag-3\""),
                object("incoming/.hidden.pdf", "\"etag-4\""));

        List<ResolvedInput> work = source.resolve(spec(), ctx);

        assertEquals(1, work.size());
        assertEquals(List.of("s3://" + BUCKET + "/doc.pdf"), ctx.present);
    }

    @Test
    void listingPagesAreAllRead() throws IOException {
        ListObjectsV2Response firstPage =
                ListObjectsV2Response.builder()
                        .contents(object("a.pdf", "\"etag-a\""))
                        .nextContinuationToken("next")
                        .build();
        ListObjectsV2Response secondPage =
                ListObjectsV2Response.builder().contents(object("b.pdf", "\"etag-b\"")).build();
        when(s3Client.listObjectsV2(any(ListObjectsV2Request.class)))
                .thenReturn(firstPage, secondPage);

        assertEquals(2, source.resolve(spec(), ctx).size());
    }

    @Test
    void aListingFailurePropagatesSoTheSweepVetoesCleanup() {
        when(s3Client.listObjectsV2(any(ListObjectsV2Request.class)))
                .thenThrow(SdkClientException.create("connection refused"));

        assertThrows(SdkClientException.class, () -> source.resolve(spec(), ctx));
    }

    @Test
    void resourceStreamsTheObjectAndNamesItByKeyBasename() throws IOException {
        listingReturns(object("incoming/doc.pdf", "\"etag-1\""));
        byte[] payload = "data".getBytes(StandardCharsets.UTF_8);
        when(s3Client.getObject(any(GetObjectRequest.class)))
                .thenReturn(
                        new ResponseInputStream<>(
                                GetObjectResponse.builder().build(),
                                AbortableInputStream.create(new ByteArrayInputStream(payload))));

        var resource = source.resolve(spec(), ctx).get(0).inputs().primary().get(0);

        assertEquals("doc.pdf", resource.getFilename());
        // Content length comes from the listing, not a download.
        assertEquals(4, resource.contentLength());
        try (var stream = resource.getInputStream()) {
            assertEquals("data", new String(stream.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    @Test
    void aMissingETagFallsBackToSizeAndLastModified() throws IOException {
        Instant modified = Instant.parse("2026-01-01T00:00:00Z");
        listingReturns(S3Object.builder().key("doc.pdf").size(4L).lastModified(modified).build());

        assertEquals(1, source.resolve(spec(), ctx).size());
        // The same gate on the next sweep reads as already claimed.
        listingReturns(S3Object.builder().key("doc.pdf").size(4L).lastModified(modified).build());
        assertTrue(source.resolve(spec(), ctx).isEmpty());
    }

    @Test
    void validateRejectsBadConfig() {
        assertThrows(
                IllegalArgumentException.class,
                () -> source.validate(new InputSpec("s3", Map.of())));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        source.validate(
                                new InputSpec(
                                        "s3", Map.of("bucket", BUCKET, "accessKeyId", "AKIA"))));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        source.validate(
                                new InputSpec("s3", Map.of("bucket", BUCKET, "mode", "sideways"))));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        source.validate(
                                new InputSpec(
                                        "s3",
                                        Map.of(
                                                "bucket",
                                                BUCKET,
                                                "endpoint",
                                                "ftp://example.com"))));
    }

    @Test
    void validateRejectsAnUnreachableBucket() {
        when(s3Client.listObjectsV2(any(ListObjectsV2Request.class)))
                .thenThrow(SdkClientException.create("connection refused"));

        assertThrows(
                IllegalArgumentException.class,
                () -> source.validate(new InputSpec("s3", Map.of("bucket", BUCKET))));
    }

    private static InputSpec spec() {
        return new InputSpec("s3", Map.of("bucket", BUCKET));
    }

    private static S3Object object(String key, String eTag) {
        return S3Object.builder()
                .key(key)
                .eTag(eTag)
                .size(4L)
                .lastModified(Instant.parse("2026-01-01T00:00:00Z"))
                .build();
    }

    private void listingReturns(S3Object... objects) {
        when(s3Client.listObjectsV2(any(ListObjectsV2Request.class)))
                .thenReturn(ListObjectsV2Response.builder().contents(objects).build());
    }

    private void headReturns(String key, String eTag) {
        when(s3Client.headObject(any(HeadObjectRequest.class)))
                .thenReturn(
                        HeadObjectResponse.builder()
                                .eTag(eTag)
                                .contentLength(4L)
                                .lastModified(Instant.parse("2026-01-01T00:00:00Z"))
                                .build());
    }

    private class RecordingContext implements ResolveContext {

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
        public void settle(
                String identity, String finalGate, String finalContentHash, boolean success) {
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
