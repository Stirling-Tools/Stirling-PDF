package stirling.software.proprietary.security.database.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.DatabaseVersion;

@Repository
public interface DatabaseVersionRepository extends JpaRepository<DatabaseVersion, Long> {
    Optional<DatabaseVersion> findLastByOrderByIdDesc();

    @Query(
            "SELECT CASE WHEN COUNT(d) > 0 THEN true ELSE false END FROM DatabaseVersion d WHERE"
                    + " d.version = :version AND d.id = (SELECT MAX(d2.id) FROM DatabaseVersion d2"
                    + " WHERE d2.version = :version)")
    boolean existsByVersionAndLastInserted(String version, boolean lastInserted);
}
