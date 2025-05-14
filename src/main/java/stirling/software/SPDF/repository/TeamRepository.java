package stirling.software.SPDF.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import stirling.software.SPDF.model.Team;

@Repository
public interface TeamRepository extends JpaRepository<Team, Long> {
    Optional<Team> findByName(String name);

    @Query("SELECT t FROM Team t LEFT JOIN FETCH t.users")
    List<Team> findAllWithUsers();
    
	boolean existsByNameIgnoreCase(String name);
}