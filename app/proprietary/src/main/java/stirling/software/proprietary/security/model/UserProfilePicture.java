package stirling.software.proprietary.security.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;

import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

/**
 * A user's avatar, in its own table so the bytes never ride along on the eagerly-fetched users row.
 * Two sizes: the full avatar, and a thumbnail the roster endpoints inline as data URLs.
 */
@Entity
@Table(name = "user_profile_pictures")
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class UserProfilePicture implements Serializable {

    private static final long serialVersionUID = 1L;

    /** Shares the users PK; one avatar per user. */
    @Id
    @Column(name = "user_id")
    @EqualsAndHashCode.Include
    @ToString.Include
    private Long userId;

    @Lob
    @Column(name = "image_data", nullable = false, columnDefinition = "bytea")
    @JsonIgnore
    private byte[] imageData;

    @Lob
    @Column(name = "thumbnail_data", nullable = false, columnDefinition = "bytea")
    @JsonIgnore
    private byte[] thumbnailData;

    /** Always image/png - uploads are re-encoded on the way in. */
    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
