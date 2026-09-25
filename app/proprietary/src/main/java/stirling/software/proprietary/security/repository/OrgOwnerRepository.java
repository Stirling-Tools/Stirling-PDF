package stirling.software.proprietary.security.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.*;

import jakarta.persistence.LockModeType;

import stirling.software.proprietary.model.OrgOwner;

public interface OrgOwnerRepository extends JpaRepository<OrgOwner, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM OrgOwner o WHERE o.id = 1")
    Optional<OrgOwner> lockOwner();
}
