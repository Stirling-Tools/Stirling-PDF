package stirling.software.saas.accountlink;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

/** Data access for {@link ConnectRequest}. Plain Spring Data JPA, same posture as the rest here. */
public interface ConnectRequestRepository extends JpaRepository<ConnectRequest, Long> {

    Optional<ConnectRequest> findByRequestId(String requestId);

    /**
     * Row-locking read used by approve, deny and claim.
     *
     * <p>Each of those transitions a status exactly once, and claim additionally mints a
     * credential. Without the lock, two concurrent claims could both observe {@code APPROVED} and
     * mint two credentials from one approval, so the single-use guarantee has to be held by the
     * database rather than by the read-then-write in the service.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ConnectRequest r WHERE r.requestId = :requestId")
    Optional<ConnectRequest> findByRequestIdForUpdate(@Param("requestId") String requestId);

    /** Backs the per-IP creation cap, since creating a request needs no authentication. */
    long countByRequesterIpAndCreatedAtAfter(String requesterIp, LocalDateTime after);
}
