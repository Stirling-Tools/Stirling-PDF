package stirling.software.saas.procurement.model;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;

/** Durable commercial audit trail in the existing procurement_activity table. */
@Entity
@Table(name = "procurement_activity")
@Getter
@NoArgsConstructor
public class ProcurementActivity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "activity_id")
    private Long id;

    @Column(name = "deal_id", nullable = false)
    private Long dealId;

    @Column(name = "action", nullable = false, length = 48)
    private String action;

    @Column(name = "detail")
    private String detail;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public ProcurementActivity(Long dealId, String action, String detail) {
        this.dealId = dealId;
        this.action = action;
        this.detail = detail;
    }
}
