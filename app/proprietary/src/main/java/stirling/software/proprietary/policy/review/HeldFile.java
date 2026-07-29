package stirling.software.proprietary.policy.review;

/** One output file parked in {@code FileStorage} while its review item is pending. */
public record HeldFile(String fileId, String fileName) {}
