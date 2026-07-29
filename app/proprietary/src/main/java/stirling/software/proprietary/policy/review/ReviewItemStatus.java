package stirling.software.proprietary.policy.review;

/** Lifecycle of a review item. Terminal states keep the item as an audit record. */
public enum ReviewItemStatus {
    PENDING,
    APPROVED,
    REJECTED
}
