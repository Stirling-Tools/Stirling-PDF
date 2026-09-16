package stirling.software.saas.usage;

import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;

/** Lifetime guest tool executions, including reservations for requests still running. */
@Entity
@Table(name = "guest_tool_usage")
@Getter
@Setter
@NoArgsConstructor
public class GuestToolUsage {
    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false)
    private int used;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User user;

    public GuestToolUsage(Long userId) {
        this.userId = userId;
    }
}
