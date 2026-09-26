package stirling.software.proprietary.policy.webhook;

import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.storage.crypto.ResourceUpload;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;

/**
 * Holds inbound webhook documents between arrival and processing. Bytes go through {@link
 * StorageProvider} like every other stored file, so encryption at rest covers them whenever the
 * operator has it on; the {@link WebhookDeliveryStore} index is what a sweep lists, since storage
 * itself cannot be enumerated.
 *
 * <p>A delivery is stored under the webhook source's owner (or the internal API user when login is
 * off and the source has none), which is also the scope its encryption key is chosen from. A source
 * whose owner cannot be resolved refuses the delivery rather than storing it unattributed.
 */
@Slf4j
@Service
public class WebhookDeliveries {

    private static final String DEFAULT_NAME = "document.pdf";

    private final StorageProvider storageProvider;
    private final WebhookDeliveryStore store;
    private final UserService userService;
    private final Supplier<Long> nowMillis;

    @Autowired
    public WebhookDeliveries(
            StorageProvider storageProvider, WebhookDeliveryStore store, UserService userService) {
        this(storageProvider, store, userService, System::currentTimeMillis);
    }

    WebhookDeliveries(
            StorageProvider storageProvider,
            WebhookDeliveryStore store,
            UserService userService,
            Supplier<Long> nowMillis) {
        this.storageProvider = storageProvider;
        this.store = store;
        this.userService = userService;
        this.nowMillis = nowMillis;
    }

    /**
     * Store one delivery for the policies fed by {@code source}.
     *
     * @throws IllegalStateException if no user can own the stored bytes
     * @throws IOException if storage refuses the write
     */
    public WebhookDelivery accept(Source source, String filename, String contentType, byte[] body)
            throws IOException {
        String webhookId = WebhookConfig.from(source.options()).webhookId();
        String name = sanitizeFilename(filename);
        User owner = storageOwnerFor(source);
        StoredObject stored =
                storageProvider.store(
                        owner,
                        new ResourceUpload(
                                new ByteArrayResource(body), name, contentType, body.length));
        WebhookDelivery delivery =
                new WebhookDelivery(
                        UUID.randomUUID().toString().replace("-", ""),
                        webhookId,
                        stored.getStorageKey(),
                        name,
                        contentType,
                        body.length,
                        nowMillis.get(),
                        null);
        try {
            return store.save(delivery);
        } catch (RuntimeException indexFailed) {
            // An unindexed blob is unreachable forever, so take it back out rather than orphan it.
            deleteQuietly(stored.getStorageKey());
            throw indexFailed;
        }
    }

    public List<WebhookDelivery> pending(String webhookId) {
        return store.forWebhook(webhookId);
    }

    /** The delivered bytes, named as the sender named them. */
    public Resource open(WebhookDelivery delivery) throws IOException {
        Resource raw = storageProvider.load(delivery.storageKey());
        return new NamedResource(raw, delivery.originalFilename());
    }

    public void recordFailure(WebhookDelivery delivery) {
        store.save(delivery.withFailedAt(nowMillis.get()));
    }

    /** Remove the bytes and the index row. Safe to call twice. */
    public void discard(WebhookDelivery delivery) {
        deleteQuietly(delivery.storageKey());
        store.delete(delivery.id());
    }

    private void deleteQuietly(String storageKey) {
        try {
            storageProvider.delete(storageKey);
        } catch (IOException e) {
            log.warn("Could not remove webhook delivery blob {}: {}", storageKey, e.getMessage());
        }
    }

    private User storageOwnerFor(Source source) {
        Optional<User> owner =
                Optional.ofNullable(source.owner())
                        .filter(username -> !username.isBlank())
                        .flatMap(userService::findByUsername);
        if (owner.isEmpty()) {
            owner = userService.findByUsername(Role.INTERNAL_API_USER.getRoleId());
        }
        return owner.orElseThrow(
                () ->
                        new IllegalStateException(
                                "Webhook source "
                                        + source.id()
                                        + " has no user to own deliveries"));
    }

    static String sanitizeFilename(String filename) {
        if (filename == null) {
            return DEFAULT_NAME;
        }
        String base = filename.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        if (slash >= 0) {
            base = base.substring(slash + 1);
        }
        base = base.replaceAll("[^A-Za-z0-9._-]", "_").trim();
        while (base.startsWith(".")) {
            base = base.substring(1);
        }
        return base.isEmpty() ? DEFAULT_NAME : base;
    }

    /** Storage names blobs by key; the pipeline wants the sender's filename on the input. */
    private static final class NamedResource extends org.springframework.core.io.AbstractResource {

        private final Resource delegate;
        private final String filename;

        private NamedResource(Resource delegate, String filename) {
            this.delegate = delegate;
            this.filename = filename;
        }

        @Override
        public java.io.InputStream getInputStream() throws IOException {
            return delegate.getInputStream();
        }

        @Override
        public boolean exists() {
            return delegate.exists();
        }

        @Override
        public boolean isOpen() {
            return delegate.isOpen();
        }

        @Override
        public long contentLength() throws IOException {
            return delegate.contentLength();
        }

        @Override
        public String getFilename() {
            return filename;
        }

        @Override
        public String getDescription() {
            return "webhook delivery " + filename;
        }
    }
}
