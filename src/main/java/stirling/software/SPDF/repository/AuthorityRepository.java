package stirling.software.SPDF.repository;

import java.util.Set;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.SPDF.model.Authority;

@Repository
public interface AuthorityRepository extends JpaRepository<Authority, Long> {
    // Set<Authority> findByUsername(String username);
    Set<Authority> findByUser_Username(String username);

    Authority findByUserId(long user_id);
}
