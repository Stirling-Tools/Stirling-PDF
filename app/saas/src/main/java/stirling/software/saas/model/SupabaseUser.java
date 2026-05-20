package stirling.software.saas.model;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Data;

/** Read-only mirror of Supabase's {@code auth.users} table. */
@Data
@Entity
@Table(name = "users", schema = "auth")
public class SupabaseUser {

    @Id
    @Column(name = "id", unique = true, nullable = false, updatable = false)
    private UUID id;

    @Column(name = "email", unique = true)
    private String email;

    @Column(name = "is_sso_user")
    private boolean isSSOUser;

    @Column(name = "is_anonymous")
    private boolean isAnonymous;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
