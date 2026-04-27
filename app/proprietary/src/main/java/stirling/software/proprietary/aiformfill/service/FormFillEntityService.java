package stirling.software.proprietary.aiformfill.service;

import java.util.HashMap;
import java.util.List;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.aiformfill.dto.FormFillEntityImportRequest;
import stirling.software.proprietary.aiformfill.dto.FormFillEntityUpsertRequest;
import stirling.software.proprietary.aiformfill.model.FormFillEntity;
import stirling.software.proprietary.aiformfill.repository.FormFillEntityRepository;
import stirling.software.proprietary.security.model.User;

@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class FormFillEntityService {

    /** Hard cap to match the engine-side knowledge dict limit and guard against runaway growth. */
    private static final int MAX_ENTITIES_PER_USER = 1000;

    private final FormFillEntityRepository repository;

    public User requireAuthenticatedUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof User user) {
            return user;
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unsupported user principal");
    }

    @Transactional(readOnly = true)
    public List<FormFillEntity> list(User owner) {
        return repository.findAllByOwnerOrderByUpdatedAtDesc(owner);
    }

    @Transactional(readOnly = true)
    public FormFillEntity get(User owner, String id) {
        return repository
                .findByIdAndOwner(id, owner)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "Entity not found"));
    }

    public FormFillEntity upsert(User owner, String id, FormFillEntityUpsertRequest request) {
        if (id == null || id.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Entity id required");
        }

        FormFillEntity entity =
                repository
                        .findByIdAndOwner(id, owner)
                        .orElseGet(
                                () -> {
                                    enforceLimit(owner);
                                    FormFillEntity fresh = new FormFillEntity();
                                    fresh.setId(id);
                                    fresh.setOwner(owner);
                                    return fresh;
                                });

        entity.setEntityType(request.getEntityType());
        entity.setName(request.getName());
        entity.setFields(
                request.getFields() != null ? new HashMap<>(request.getFields()) : new HashMap<>());
        return repository.save(entity);
    }

    public void delete(User owner, String id) {
        if (!repository.findByIdAndOwner(id, owner).isPresent()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Entity not found");
        }
        repository.deleteByIdAndOwner(id, owner);
    }

    public List<FormFillEntity> importBatch(User owner, FormFillEntityImportRequest request) {
        if (request == null || request.getEntities() == null || request.getEntities().isEmpty()) {
            return List.of();
        }
        return request.getEntities().stream()
                .filter(Objects::nonNull)
                .filter(item -> item.getId() != null && !item.getId().isBlank())
                .filter(item -> item.getEntity() != null)
                .map(item -> upsert(owner, item.getId(), item.getEntity()))
                .toList();
    }

    private void enforceLimit(User owner) {
        long count = repository.countByOwner(owner);
        if (count >= MAX_ENTITIES_PER_USER) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "Entity limit of " + MAX_ENTITIES_PER_USER + " reached");
        }
    }
}
