package stirling.software.proprietary.accountlink;

import java.io.Serializable;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The device credential this self-hosted instance received when it linked a SaaS account
 * (combined-billing "Mode A"). Singleton — one instance links to exactly one SaaS team.
 *
 * <p>Unlike the SaaS side (which stores only a hash), the instance must keep the plaintext {@code
 * deviceSecret} so it can present it on every unattended entitlement call. It lives in the local
 * database (the same store that already holds API-key material and the license signature), so it is
 * as secure-at-rest as the rest of the instance's secrets.
 */
@Entity
@Table(name = "account_link_device_credential")
@NoArgsConstructor
@Getter
@Setter
public class DeviceCredential implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final Long SINGLETON_ID = 1L;

    @Id
    @Column(name = "id")
    private Long id = SINGLETON_ID;

    /** Public identifier minted by the SaaS register call; sent as {@code X-Device-Id}. */
    @Column(name = "device_id", nullable = false, length = 64)
    private String deviceId;

    /** High-entropy secret returned once by register; sent as {@code X-Device-Secret}. */
    @Column(name = "device_secret", nullable = false, length = 128)
    private String deviceSecret;

    /** SaaS team this instance is linked to; informational on the instance side. */
    @Column(name = "team_id")
    private Long teamId;

    @Column(name = "linked_at", nullable = false)
    private LocalDateTime linkedAt;
}
