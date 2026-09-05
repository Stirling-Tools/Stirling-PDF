package stirling.software.saas.store;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One install of a listing into one target ({@code store_install}), where a target is a SaaS team
 * or a linked self-hosted server, both identified by the installing team's id. Reinstalls do not
 * add rows, so the install count means "places this runs", not clicks. Nothing here tracks the copy
 * afterwards.
 */
@Entity
@Table(name = "store_install")
@Getter
@Setter
@NoArgsConstructor
public class StoreInstall {

    public enum Target {
        TEAM,
        SERVER
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_kind", nullable = false, length = 16)
    private Target targetKind;

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    @Column(name = "installed_by_user_id")
    private Long installedByUserId;

    @CreationTimestamp
    @Column(name = "installed_at", nullable = false, updatable = false)
    private LocalDateTime installedAt;

    public StoreInstall(Long listingId, Target targetKind, Long targetId, Long installedByUserId) {
        this.listingId = listingId;
        this.targetKind = targetKind;
        this.targetId = targetId;
        this.installedByUserId = installedByUserId;
    }
}
