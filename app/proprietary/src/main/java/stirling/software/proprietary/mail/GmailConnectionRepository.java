package stirling.software.proprietary.mail;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GmailConnectionRepository extends JpaRepository<GmailConnectionEntity, Long> {

    Optional<GmailConnectionEntity> findByUsername(String username);
}
