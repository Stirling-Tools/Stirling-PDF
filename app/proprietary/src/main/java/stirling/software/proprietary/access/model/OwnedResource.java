package stirling.software.proprietary.access.model;

import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MappedSuperclass;

import lombok.Getter;
import lombok.Setter;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

/** Base for a resource owned by a user, a team, or the server, with grant-based access. */
@MappedSuperclass
@Getter
@Setter
public abstract class OwnedResource {

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false, length = 32)
    private OwnerScope scope;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_user_id")
    private User ownerUser;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_team_id")
    private Team ownerTeam;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    // Server resource that users cannot override with their own of the same kind.
    @Column(name = "locked", nullable = false)
    private boolean locked = false;

    // Who, besides owner/admin/grantees, may use this resource.
    @Enumerated(EnumType.STRING)
    @Column(name = "default_access", nullable = false, length = 32)
    private DefaultAccessPolicy defaultAccess = DefaultAccessPolicy.EXPLICIT_ONLY;

    /** Subclass primary key. */
    public abstract Long getId();

    public Long getOwnerUserId() {
        return ownerUser != null ? ownerUser.getId() : null;
    }

    public Long getOwnerTeamId() {
        return ownerTeam != null ? ownerTeam.getId() : null;
    }
}
