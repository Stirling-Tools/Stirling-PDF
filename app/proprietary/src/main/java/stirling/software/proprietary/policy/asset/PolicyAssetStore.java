package stirling.software.proprietary.policy.asset;

import java.util.List;
import java.util.Optional;

/**
 * Persistence for pipeline supporting files. Metadata and bytes are stored together but read
 * separately: lists and validation only need {@link PolicyAsset}, while a run loads {@link
 * #content} for just the assets its steps reference.
 */
public interface PolicyAssetStore {

    /** Persist an asset (a blank id is assigned) and return the stored metadata. */
    PolicyAsset save(PolicyAsset asset, byte[] content);

    Optional<PolicyAsset> get(String id);

    /** The asset's bytes, or empty if the id is unknown. */
    Optional<byte[]> content(String id);

    /** Assets belonging to a team, newest first. {@code null} matches no-team (login-disabled). */
    List<PolicyAsset> findByTeam(Long teamId);

    /** All assets, for team-scoping-off (login-disabled) reads. */
    List<PolicyAsset> all();

    /** Remove an asset. Returns false if the id was unknown. */
    boolean delete(String id);
}
