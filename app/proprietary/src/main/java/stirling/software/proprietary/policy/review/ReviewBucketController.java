package stirling.software.proprietary.policy.review;

import java.io.IOException;
import java.util.List;
import java.util.Locale;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * Portal endpoints for the review bucket: the team's rule config, the queue of held items, and
 * approve/reject. Everything here — reads included — is restricted to users who can manage policies
 * (team leader on SaaS, admin self-hosted): the queue exposes held document content, so seeing it
 * is portal-level access, not general team access.
 */
@Hidden
@RestController
@RequestMapping("/api/v1/review")
@RequiredArgsConstructor
@Tag(name = "Review", description = "Human review of files held by the review bucket")
public class ReviewBucketController {

    private final ReviewService reviewService;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final ApplicationProperties applicationProperties;

    @GetMapping("/config")
    @Operation(summary = "Get the team's review bucket configuration")
    public ReviewBucketConfig getConfig() {
        requireReviewAccess();
        return reviewService.config();
    }

    @PutMapping("/config")
    @Operation(summary = "Save the team's review bucket configuration")
    public ReviewBucketConfig saveConfig(@RequestBody ReviewBucketConfig config) {
        requireReviewAccess();
        return reviewService.saveConfig(config);
    }

    /** Listing shape for the portal review queue. */
    public record ReviewItemsResponse(List<ReviewItemView> items) {}

    @GetMapping("/items")
    @Operation(summary = "List the team's review items, newest first")
    public ReviewItemsResponse items(@RequestParam(required = false) ReviewItemStatus status) {
        requireReviewAccess();
        return new ReviewItemsResponse(
                reviewService.items(status).stream().map(ReviewItemView::of).toList());
    }

    @PostMapping("/items/{itemId}/approve")
    @Operation(summary = "Approve a held item, releasing its files to their destination")
    public ReviewItemView approve(@PathVariable String itemId) throws IOException {
        requireReviewAccess();
        return ReviewItemView.of(reviewService.approve(itemId));
    }

    @PostMapping("/items/{itemId}/reject")
    @Operation(summary = "Reject a held item, discarding its files")
    public ReviewItemView reject(@PathVariable String itemId) {
        requireReviewAccess();
        return ReviewItemView.of(reviewService.reject(itemId));
    }

    /** The items a bulk decision applies to — the ids the reviewer can currently see. */
    public record BulkReviewRequest(List<String> itemIds) {}

    @PostMapping("/items/bulk/approve")
    @Operation(summary = "Approve several held items, releasing their files")
    public ReviewService.BulkResult approveAll(@RequestBody BulkReviewRequest request) {
        requireReviewAccess();
        return reviewService.resolveAll(request.itemIds(), ReviewItemStatus.APPROVED);
    }

    @PostMapping("/items/bulk/reject")
    @Operation(summary = "Reject several held items, discarding their files")
    public ReviewService.BulkResult rejectAll(@RequestBody BulkReviewRequest request) {
        requireReviewAccess();
        return reviewService.resolveAll(request.itemIds(), ReviewItemStatus.REJECTED);
    }

    @GetMapping("/items/{itemId}/files/{fileId}")
    @Operation(summary = "Download a held file for inspection")
    public ResponseEntity<byte[]> heldFile(
            @PathVariable String itemId, @PathVariable String fileId) {
        requireReviewAccess();
        ReviewService.HeldFileContent content = reviewService.heldFile(itemId, fileId);
        MediaType mediaType =
                content.fileName().toLowerCase(Locale.ROOT).endsWith(".pdf")
                        ? MediaType.APPLICATION_PDF
                        : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(content.fileName()).build().toString())
                .body(content.bytes());
    }

    /**
     * Same rule as {@code PolicyController#requirePolicyEditingAllowed}, applied to reads too:
     * review exposes held document content, so the whole area is portal-access only. Single-user
     * deployments (login disabled) trust the local operator.
     */
    private void requireReviewAccess() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Review is restricted to team leaders");
        }
    }
}
