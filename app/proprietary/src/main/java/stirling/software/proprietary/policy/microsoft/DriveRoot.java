package stirling.software.proprietary.policy.microsoft;

public record DriveRoot(String driveId, String itemId) {

    public String key() {
        return itemId == null ? "root" : itemId;
    }
}
