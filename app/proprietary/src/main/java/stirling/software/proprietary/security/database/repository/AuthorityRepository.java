package stirling.software.proprietary.security.database.repository;

import java.util.Collection;
import java.util.List;
import java.util.Set;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.proprietary.security.model.Authority;

public interface AuthorityRepository extends JpaRepository<Authority, Long> {
    // Set<Authority> findByUsername(String username);
    Set<Authority> findByUser_Username(String username);

    Authority findByUserId(long user_id);

    @Query("select a.id from Authority a where a.user.id in :userIds")
    List<Long> findIdsByUserIdIn(@Param("userIds") Collection<Long> userIds);
}
