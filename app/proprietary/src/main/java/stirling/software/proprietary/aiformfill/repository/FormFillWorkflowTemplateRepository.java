package stirling.software.proprietary.aiformfill.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.aiformfill.model.FormFillWorkflowTemplate;
import stirling.software.proprietary.security.model.User;

@Repository
public interface FormFillWorkflowTemplateRepository
        extends JpaRepository<FormFillWorkflowTemplate, String> {

    List<FormFillWorkflowTemplate> findAllByOwnerOrderByLastUsedAtDescCreatedAtDesc(User owner);

    Optional<FormFillWorkflowTemplate> findByIdAndOwner(String id, User owner);

    Optional<FormFillWorkflowTemplate> findByOwnerAndFormSignature(
            User owner, String formSignature);

    void deleteByIdAndOwner(String id, User owner);
}
