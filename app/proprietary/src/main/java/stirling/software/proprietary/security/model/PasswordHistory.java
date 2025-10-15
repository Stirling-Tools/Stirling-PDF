package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import jakarta.persistence.*;

import lombok.Data;
import lombok.NoArgsConstructor;

/** Entity for tracking password history to prevent reuse. */
@Entity
@Table(name = "password_history")
@Data
@NoArgsConstructor
public class PasswordHistory implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    /** Create a new password history entry. */
    public static PasswordHistory createEntry(User user, String passwordHash) {
        PasswordHistory history = new PasswordHistory();
        history.setUser(user);
        history.setPasswordHash(passwordHash);
        return history;
    }
}
