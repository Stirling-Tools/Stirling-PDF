package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.shadow.PaygShadowCharge;

@Repository
public interface PaygShadowChargeRepository extends JpaRepository<PaygShadowCharge, Long> {

    @Query(
            "SELECT s FROM PaygShadowCharge s"
                    + " WHERE s.occurredAt >= :from AND s.occurredAt < :to"
                    + " ORDER BY s.occurredAt DESC")
    List<PaygShadowCharge> findInWindow(
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
