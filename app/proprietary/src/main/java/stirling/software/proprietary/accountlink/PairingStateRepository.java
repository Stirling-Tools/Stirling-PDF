package stirling.software.proprietary.accountlink;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PairingStateRepository extends JpaRepository<PairingState, Long> {

    /** The singleton in-flight pairing, if one is running. */
    default Optional<PairingState> findState() {
        return findById(PairingState.SINGLETON_ID);
    }
}
