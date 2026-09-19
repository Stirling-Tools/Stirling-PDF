package stirling.software.proprietary.model;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import lombok.Getter;
import lombok.Setter;

/** Deployment ownership; never populated or consulted on SaaS. */
@Entity
@Table(name = "org_owner")
@Getter
@Setter
public class OrgOwner {
    public static final Long SINGLETON_ID = 1L;
    @Id private Long id = SINGLETON_ID;
    private Long ownerUserId;
    private String ownerUsername;
    private LocalDateTime assignedAt;
    private String assignedReason;
    private Long handoverTargetId;
    private String handoverTargetUsername;
    private String handoverTargetEmail;
    private String handoverDeviceId;
    private Long handoverTeamId;
    private Long handoverLeaderId;
}
