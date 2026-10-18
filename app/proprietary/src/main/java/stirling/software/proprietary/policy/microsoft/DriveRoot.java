package stirling.software.proprietary.policy.microsoft;

/**
 * Where a location's paths start: a drive and, for a linked folder, that folder's item id ({@code
 * null} means the drive's root).
 */
public record DriveRoot(String driveId, String itemId) {

    /** The identity segment for this anchor: {@code root}, or the linked folder's item id. */
    public String key() {
        return itemId == null ? "root" : itemId;
    }
}
