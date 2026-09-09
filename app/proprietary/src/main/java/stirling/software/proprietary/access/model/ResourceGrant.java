package stirling.software.proprietary.access.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;

/** Grants a user or team access to a resource. Owner and admin access are implicit. */
@Entity
@Table(
        name = "resource_grants",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_resource_grant",
                        columnNames = {
                            "resource_type",
                            "resource_id",
                            "principal_type",
                            "principal_id",
                            "permission"
                        }),
        indexes = {
            @Index(name = "idx_resource_grants_lookup", columnList = "resource_type,resource_id"),
            @Index(
                    name = "idx_resource_grants_principal",
                    columnList = "principal_type,principal_id")
        })
@NoArgsConstructor
@Getter
@Setter
public class ResourceGrant implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "resource_grant_id")
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "resource_type", nullable = false, length = 64)
    private ResourceType resourceType;

    // Empty string (never null) for a whole-type grant such as the portal.
    @Column(name = "resource_id", nullable = false, length = 255)
    private String resourceId = "";

    @Enumerated(EnumType.STRING)
    @Column(name = "principal_type", nullable = false, length = 32)
    private PrincipalType principalType;

    @Column(name = "principal_id", nullable = false)
    private Long principalId;

    @Enumerated(EnumType.STRING)
    @Column(name = "permission", nullable = false, length = 32)
    private AccessPermission permission;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "granted_by_user_id")
    private User grantedBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
