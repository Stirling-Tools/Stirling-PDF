package stirling.software.proprietary.storage.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;

@Entity
@Table(
        name = "file_shares",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uk_file_share_user",
                    columnNames = {"stored_file_id", "shared_with_user_id"}),
            @UniqueConstraint(
                    name = "uk_file_share_token",
                    columnNames = {"share_token"})
        })
@NoArgsConstructor
@Getter
@Setter
public class FileShare implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "file_share_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stored_file_id", nullable = false)
    private StoredFile file;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shared_with_user_id")
    private User sharedWithUser;

    @Column(name = "share_token", unique = true)
    private String shareToken;

    @Column(name = "public_link")
    private boolean publicLink;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
