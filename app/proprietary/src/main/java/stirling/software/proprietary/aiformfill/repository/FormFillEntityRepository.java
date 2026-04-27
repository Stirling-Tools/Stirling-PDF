package stirling.software.proprietary.aiformfill.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.aiformfill.model.FormFillEntity;
import stirling.software.proprietary.security.model.User;

@Repository
public interface FormFillEntityRepository extends JpaRepository<FormFillEntity, String> {

    List<FormFillEntity> findAllByOwnerOrderByUpdatedAtDesc(User owner);

    Optional<FormFillEntity> findByIdAndOwner(String id, User owner);

    long countByOwner(User owner);

    void deleteByIdAndOwner(String id, User owner);
}
