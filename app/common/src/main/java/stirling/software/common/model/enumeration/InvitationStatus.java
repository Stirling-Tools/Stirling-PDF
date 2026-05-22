package stirling.software.common.model.enumeration;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/** Team invitation status */
@Getter
@RequiredArgsConstructor
public enum InvitationStatus {
    PENDING("PENDING"),
    ACCEPTED("ACCEPTED"),
    REJECTED("REJECTED"),
    CANCELLED("CANCELLED"),
    EXPIRED("EXPIRED");

    private final String statusName;

    public static InvitationStatus fromString(String statusName) {
        for (InvitationStatus status : InvitationStatus.values()) {
            if (status.getStatusName().equalsIgnoreCase(statusName)) {
                return status;
            }
        }
        throw new IllegalArgumentException("No InvitationStatus defined for name: " + statusName);
    }
}
