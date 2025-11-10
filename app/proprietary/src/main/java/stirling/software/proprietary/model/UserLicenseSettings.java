package stirling.software.proprietary.model;

import java.io.Serializable;

import jakarta.persistence.*;

import lombok.*;

/**
 * Entity to store user license settings in the database. This is a singleton entity (only one row
 * should exist). Tracks grandfathered user counts and license limits.
 */
@Entity
@Table(name = "user_license_settings")
@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@ToString
public class UserLicenseSettings implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final Long SINGLETON_ID = 1L;

    @Id
    @Column(name = "id")
    private Long id = SINGLETON_ID;

    /**
     * The number of users that existed in the database when grandfathering was initialized. This
     * value is set once during initial setup and should NEVER be modified afterwards.
     */
    @Column(name = "grandfathered_user_count", nullable = false)
    private int grandfatheredUserCount = 0;

    /**
     * Flag to indicate that grandfathering has been initialized and locked. Once true, the
     * grandfatheredUserCount should never change. This prevents manipulation by deleting/recreating
     * the table.
     */
    @Column(name = "grandfathering_locked", nullable = false)
    private boolean grandfatheringLocked = false;

    /**
     * Maximum number of users allowed by the current license. This is updated when the license key
     * is validated.
     */
    @Column(name = "license_max_users", nullable = false)
    private int licenseMaxUsers = 0;

    /**
     * Random salt used when generating signatures. Makes it harder to recompute the signature when
     * manually editing the table.
     */
    @Column(name = "integrity_salt", nullable = false, length = 64)
    private String integritySalt = "";

    /**
     * Signed representation of {@code grandfatheredUserCount}. Stores the original value alongside
     * a secret-backed HMAC so we can detect tampering and restore the correct count.
     */
    @Column(name = "grandfathered_user_signature", nullable = false, length = 256)
    private String grandfatheredUserSignature = "";
}
