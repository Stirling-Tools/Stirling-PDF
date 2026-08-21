package stirling.software.proprietary.policy.asset;

/**
 * Metadata for a stored supporting file (e.g. a watermark image, signing certificate, or overlay
 * PDF) that pipeline steps reference from their {@code fileParameters}. The bytes live in the
 * {@link PolicyAssetStore}; this record is what lists and API responses carry. Team-scoped like
 * policies: {@code owner}/{@code teamId} are stamped server-side at upload ({@code null} when login
 * is disabled).
 */
public record PolicyAsset(
        String id,
        String fileName,
        String contentType,
        long size,
        String owner,
        Long teamId,
        long createdAt) {}
