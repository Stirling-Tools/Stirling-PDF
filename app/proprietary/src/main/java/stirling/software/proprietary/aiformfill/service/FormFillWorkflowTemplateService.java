package stirling.software.proprietary.aiformfill.service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.aiformfill.dto.FormFillWorkflowTemplateUpsertRequest;
import stirling.software.proprietary.aiformfill.model.FormFillWorkflowTemplate;
import stirling.software.proprietary.aiformfill.repository.FormFillWorkflowTemplateRepository;
import stirling.software.proprietary.security.model.User;

@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class FormFillWorkflowTemplateService {

    private final FormFillWorkflowTemplateRepository repository;

    @Transactional(readOnly = true)
    public List<FormFillWorkflowTemplate> list(User owner) {
        return repository.findAllByOwnerOrderByLastUsedAtDescCreatedAtDesc(owner);
    }

    @Transactional(readOnly = true)
    public FormFillWorkflowTemplate get(User owner, String id) {
        return repository
                .findByIdAndOwner(id, owner)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "Workflow template not found"));
    }

    @Transactional(readOnly = true)
    public Optional<FormFillWorkflowTemplate> findBySignature(User owner, String formSignature) {
        return repository.findByOwnerAndFormSignature(owner, formSignature);
    }

    public FormFillWorkflowTemplate upsert(
            User owner, String id, FormFillWorkflowTemplateUpsertRequest request) {
        if (id == null || id.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Template id required");
        }

        FormFillWorkflowTemplate template =
                repository
                        .findByIdAndOwner(id, owner)
                        .orElseGet(
                                () -> {
                                    FormFillWorkflowTemplate fresh = new FormFillWorkflowTemplate();
                                    fresh.setId(id);
                                    fresh.setOwner(owner);
                                    return fresh;
                                });

        template.setName(request.getName());
        template.setFormSignature(request.getFormSignature());
        template.setRoleEntityMap(
                request.getRoleEntityMap() != null
                        ? new HashMap<>(request.getRoleEntityMap())
                        : new HashMap<>());
        template.setFileOverrides(
                request.getFileOverrides() != null
                        ? new HashMap<>(request.getFileOverrides())
                        : new HashMap<>());
        if (template.getLastUsedAt() == null) {
            template.setLastUsedAt(LocalDateTime.now());
        }
        return repository.save(template);
    }

    public FormFillWorkflowTemplate touchLastUsed(User owner, String id) {
        FormFillWorkflowTemplate template = get(owner, id);
        template.setLastUsedAt(LocalDateTime.now());
        return repository.save(template);
    }

    public void delete(User owner, String id) {
        if (!repository.findByIdAndOwner(id, owner).isPresent()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Workflow template not found");
        }
        repository.deleteByIdAndOwner(id, owner);
    }
}
