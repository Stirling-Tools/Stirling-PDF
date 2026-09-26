package stirling.software.saas.store;

import java.util.List;

/**
 * The publish dry run. {@code manifest} is present only when nothing blocks, so a client can never
 * publish something the report refused. {@code existingStoreId} is set when the policy already has
 * a listing owned by the caller's team, which makes the publish a republish under that id.
 */
public record PreflightReport(
        List<StoreFinding> findings,
        boolean canPublish,
        String existingStoreId,
        StoreManifest manifest) {}
