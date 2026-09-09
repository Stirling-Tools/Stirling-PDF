package stirling.software.saas.store;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One star on a listing ({@code store_star}). The composite key is what makes "one star per person"
 * a database fact rather than a code path. {@code userId} is the internal users row id and is never
 * exposed.
 */
@Entity
@Table(name = "store_star")
@IdClass(StoreStar.Key.class)
@Getter
@Setter
@NoArgsConstructor
public class StoreStar {

    @Id
    @Column(name = "listing_id", nullable = false)
    private Long listingId;

    @Id
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public StoreStar(Long listingId, Long userId) {
        this.listingId = listingId;
        this.userId = userId;
    }

    /** Composite primary key: (listing, user). */
    @NoArgsConstructor
    @Getter
    @Setter
    public static class Key implements Serializable {
        private static final long serialVersionUID = 1L;

        private Long listingId;
        private Long userId;

        public Key(Long listingId, Long userId) {
            this.listingId = listingId;
            this.userId = userId;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key other
                    && Objects.equals(listingId, other.listingId)
                    && Objects.equals(userId, other.userId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(listingId, userId);
        }
    }
}
