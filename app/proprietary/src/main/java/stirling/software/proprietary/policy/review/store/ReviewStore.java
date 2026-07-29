package stirling.software.proprietary.policy.review.store;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.review.ReviewBucketConfig;
import stirling.software.proprietary.policy.review.ReviewItem;
import stirling.software.proprietary.policy.review.ReviewItemStatus;

import tools.jackson.databind.ObjectMapper;

/**
 * Durable store for the review bucket, backed by JPA with the same JSON-authoritative pattern as
 * {@code JpaPolicyStore}: the full record lives in a JSON column, scalar columns are denormalized
 * for querying.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReviewStore {

    private final ReviewItemRepository itemRepository;
    private final ReviewBucketConfigRepository configRepository;
    private final ObjectMapper objectMapper;

    /** The team's config, or the defaults (review disabled) when none was ever saved. */
    public ReviewBucketConfig configForTeam(Long teamId) {
        return configRepository
                .findByTeam(teamId)
                .flatMap(this::toConfig)
                .orElseGet(ReviewBucketConfig::defaults);
    }

    @Transactional
    public ReviewBucketConfig saveConfig(Long teamId, ReviewBucketConfig config) {
        ReviewBucketConfigEntity entity =
                configRepository
                        .findByTeam(teamId)
                        .orElseGet(
                                () -> {
                                    ReviewBucketConfigEntity created =
                                            new ReviewBucketConfigEntity();
                                    created.setId(UUID.randomUUID().toString());
                                    created.setTeamId(teamId);
                                    return created;
                                });
        entity.setConfigJson(objectMapper.writeValueAsString(config));
        configRepository.save(entity);
        return config;
    }

    @Transactional
    public ReviewItem saveItem(ReviewItem item) {
        ReviewItemEntity entity = new ReviewItemEntity();
        entity.setId(item.id());
        entity.setTeamId(item.teamId());
        entity.setRunId(item.runId());
        entity.setStatus(item.status().name());
        entity.setCreatedAt(item.createdAt());
        entity.setItemJson(objectMapper.writeValueAsString(item));
        itemRepository.save(entity);
        return item;
    }

    public Optional<ReviewItem> getItem(String id) {
        return itemRepository.findById(id).flatMap(this::toItem);
    }

    /**
     * Atomically claim a PENDING item for resolution. False means someone else resolved (or is
     * resolving) it concurrently — the caller must not run the resolution side effects.
     *
     * <p>The claim flips only the denormalized status column; the authoritative JSON is written by
     * the {@link #saveItem} that follows the side effects. In between, a listing filtered on the
     * claimed status can transiently include the item with PENDING JSON — harmless, and gone as
     * soon as the resolution lands or the claim is released.
     */
    @Transactional
    public boolean claimPending(String id, ReviewItemStatus decision) {
        return itemRepository.claimPending(id, decision.name()) > 0;
    }

    /** Put a claimed item back to PENDING after its resolution failed, so it can be retried. */
    @Transactional
    public void releaseClaim(String id) {
        itemRepository.releaseClaim(id);
    }

    public List<ReviewItem> itemsForTeam(Long teamId, ReviewItemStatus status) {
        List<ReviewItemEntity> rows =
                status == null
                        ? itemRepository.findByTeam(teamId)
                        : itemRepository.findByTeamAndStatus(teamId, status.name());
        return rows.stream().map(this::toItem).flatMap(Optional::stream).toList();
    }

    // Skip (don't fail) rows whose JSON can't be read — e.g. written by another app version. One
    // unreadable row must never abort the queue listing.
    private Optional<ReviewItem> toItem(ReviewItemEntity entity) {
        try {
            return Optional.of(objectMapper.readValue(entity.getItemJson(), ReviewItem.class));
        } catch (Exception e) {
            log.error(
                    "Skipping unreadable review item id={}: stored JSON could not be parsed ({})",
                    entity.getId(),
                    e.getMessage());
            return Optional.empty();
        }
    }

    private Optional<ReviewBucketConfig> toConfig(ReviewBucketConfigEntity entity) {
        try {
            return Optional.of(
                    objectMapper.readValue(entity.getConfigJson(), ReviewBucketConfig.class));
        } catch (Exception e) {
            log.error(
                    "Ignoring unreadable review config for team {} ({}); using defaults",
                    entity.getTeamId(),
                    e.getMessage());
            return Optional.empty();
        }
    }
}
