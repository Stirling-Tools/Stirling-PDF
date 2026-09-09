package stirling.software.saas.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.saas.model.SaasUserExtensions;

public interface SaasUserExtensionsRepository extends JpaRepository<SaasUserExtensions, Long> {

    Optional<SaasUserExtensions> findByUserId(Long userId);

    @Query("SELECT e FROM SaasUserExtensions e WHERE e.user.supabaseId = :supabaseId")
    Optional<SaasUserExtensions> findBySupabaseId(@Param("supabaseId") UUID supabaseId);
}
