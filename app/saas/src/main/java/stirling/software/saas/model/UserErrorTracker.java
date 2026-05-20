package stirling.software.saas.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;

@Entity
@Table(name = "user_error_tracker")
@NoArgsConstructor
@Getter
@Setter
public class UserErrorTracker implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "error_tracker_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "endpoint")
    private String endpoint;

    @Column(name = "processing_error_count")
    private Integer processingErrorCount = 0;

    @Column(name = "last_processing_error")
    private LocalDateTime lastProcessingError;

    @Column(name = "reset_after")
    private LocalDateTime resetAfter;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public UserErrorTracker(User user, String endpoint, int ttlMinutes) {
        this.user = user;
        this.endpoint = endpoint;
        this.resetAfter = LocalDateTime.now().plusMinutes(ttlMinutes);
    }

    public boolean shouldChargeForProcessingError(int freeProcessingErrors) {
        return processingErrorCount != null && processingErrorCount > freeProcessingErrors;
    }

    public void recordProcessingError(int ttlMinutes) {
        this.processingErrorCount = (processingErrorCount != null ? processingErrorCount : 0) + 1;
        this.lastProcessingError = LocalDateTime.now();

        // Refresh TTL on each error
        this.resetAfter = LocalDateTime.now().plusMinutes(ttlMinutes);
    }

    public void resetErrorCount(int ttlMinutes) {
        this.processingErrorCount = 0;
        this.lastProcessingError = null;
        this.resetAfter = LocalDateTime.now().plusMinutes(ttlMinutes);
    }

    public boolean isExpired() {
        return resetAfter != null && LocalDateTime.now().isAfter(resetAfter);
    }

    public int getErrorsUntilCharged(int freeProcessingErrors) {
        int current = processingErrorCount != null ? processingErrorCount : 0;
        return Math.max(0, freeProcessingErrors + 1 - current);
    }
}
