package stirling.software.saas.accountlink;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

/** Data access for {@link ConnectRequest}. */
public interface ConnectRequestRepository extends JpaRepository<ConnectRequest, Long> {

    Optional<ConnectRequest> findByRequestId(String requestId);

    /** Row-locking read used by approve, deny and claim. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ConnectRequest r WHERE r.requestId = :requestId")
    Optional<ConnectRequest> findByRequestIdForUpdate(@Param("requestId") String requestId);

    /** Backs the per-IP creation cap, since creating a request needs no authentication. */
    long countByRequesterIpAndCreatedAtAfter(String requesterIp, LocalDateTime after);
}
