package stirling.software.proprietary.integration.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.access.model.OwnedResource;
import stirling.software.proprietary.integration.crypto.EncryptedStringConverter;

/** A named S3/MCP/API integration config; scope and ownership live on {@link OwnedResource}. */
@Entity
@Table(
        name = "integration_configs",
        indexes = {
            @Index(name = "idx_integration_configs_owner", columnList = "owner_user_id"),
            @Index(name = "idx_integration_configs_type", columnList = "integration_type"),
            @Index(name = "idx_integration_configs_scope", columnList = "scope")
        })
@NoArgsConstructor
@Getter
@Setter
public class IntegrationConfig extends OwnedResource implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "integration_config_id")
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "integration_type", nullable = false, length = 32)
    private IntegrationType integrationType;

    @Column(name = "name", nullable = false)
    private String name;

    // Type-specific fields as an AES-GCM encrypted JSON blob.
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "config_encrypted", columnDefinition = "text")
    private String config;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
