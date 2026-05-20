package stirling.software.saas.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.model.Team;

/**
 * Saas-only sidecar that holds the seat / billing / personal-team metadata for a {@link Team}.
 * Keeping these off the proprietary {@link Team} entity prevents the {@code teams} table from
 * acquiring saas-only columns under OSS Hibernate {@code ddl-auto=update}.
 *
 * <p>1:1 with {@link Team}; team_id is both PK and FK. Created lazily on first saas-mode access via
 * {@code SaasTeamExtensionService.getOrCreate(Team)}.
 *
 * <p>{@link Version} column on this entity lets seat increments stay atomic without a row lock.
 */
@Entity
@Table(name = "saas_team_extensions")
@NoArgsConstructor
@Getter
@Setter
public class SaasTeamExtensions implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String TEAM_TYPE_PERSONAL = "PERSONAL";
    public static final String TEAM_TYPE_STANDARD = "STANDARD";

    @Id
    @Column(name = "team_id")
    private Long teamId;

    // @MapsId binds this side's PK to the Team PK, so Hibernate populates teamId from the
    // team reference on persist (no manual setter race). insertable/updatable=false is no
    // longer needed because @MapsId owns the column.
    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "team_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Team team;

    @Column(name = "team_type", nullable = false)
    private String teamType = TEAM_TYPE_STANDARD;

    @Column(name = "is_personal", nullable = false)
    private Boolean isPersonal = Boolean.FALSE;

    @Column(name = "seat_count", nullable = false)
    private Integer seatCount = 1;

    @Column(name = "seats_used", nullable = false)
    private Integer seatsUsed = 0;

    @Column(name = "max_seats", nullable = false)
    private Integer maxSeats = 1;

    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version")
    private Long version;

    public SaasTeamExtensions(Team team) {
        this.team = team;
        this.teamId = team.getId();
    }

    /** Convenience boolean accessor. */
    public boolean isPersonal() {
        return Boolean.TRUE.equals(isPersonal);
    }

    /**
     * Whether this team has unused seats. Personal teams enforce a 1-seat limit; standard teams are
     * unlimited.
     */
    public boolean hasAvailableSeats() {
        if (isPersonal()) {
            return seatsUsed != null && maxSeats != null && seatsUsed < maxSeats;
        }
        return true;
    }

    /**
     * Whether this team accepts new invitations. Personal teams (1 seat, owned by one user) never
     * do; standard teams always do.
     */
    public boolean canInviteMembers() {
        return !isPersonal();
    }
}
