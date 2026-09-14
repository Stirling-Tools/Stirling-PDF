package stirling.software.proprietary.service;

import java.time.LocalDateTime;
import java.util.*;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;

import jakarta.persistence.EntityManager;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.model.OrgOwner;
import stirling.software.proprietary.security.database.repository.*;
import stirling.software.proprietary.security.model.*;
import stirling.software.proprietary.security.repository.OrgOwnerRepository;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;

/** Ownership reads never elect. Writers serialize on the singleton before checking authority. */
@Service
@RequiredArgsConstructor
@Slf4j
public class OrgOwnerService {
    private final OrgOwnerRepository repository;
    private final UserRepository users;
    private final AuthorityRepository authorities;
    private final Environment environment;
    private final EntityManager entityManager;
    private final PlatformTransactionManager transactions;
    private final ObjectProvider<DatabaseServiceInterface> database;
    private final ObjectProvider<AuditService> audit;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private OwnershipHandoverService handovers;

    private boolean saas() {
        return environment.acceptsProfiles(Profiles.of("saas"));
    }

    @Transactional(readOnly = true)
    public Optional<Long> ownerId() {
        if (saas()) return Optional.empty();
        return repository
                .findById(OrgOwner.SINGLETON_ID)
                .flatMap(this::validOwner)
                .map(User::getId);
    }

    public boolean isOwner(Long id) {
        return id != null && ownerId().filter(id::equals).isPresent();
    }

    public boolean isCurrentUser(Authentication authentication) {
        if (saas() || authentication == null || !authentication.isAuthenticated()) return false;
        return users.findByUsernameIgnoreCase(authentication.getName())
                .filter(u -> isOwner(u.getId()))
                .isPresent();
    }

    private Optional<OrgOwner> lockedOwner() {
        Optional<OrgOwner> row = repository.lockOwner();
        row.ifPresent(entityManager::refresh);
        return row;
    }

    private Optional<User> validOwner(OrgOwner row) {
        if (row.getOwnerUserId() == null) return Optional.empty();
        return users.findById(row.getOwnerUserId())
                .filter(
                        u ->
                                eligible(u)
                                        && admin(u)
                                        && Objects.equals(u.getUsername(), row.getOwnerUsername()));
    }

    private boolean admin(User u) {
        return u.getAuthorities().stream()
                .anyMatch(a -> Role.ADMIN.getRoleId().equals(a.getAuthority()));
    }

    private boolean eligible(User u) {
        return u.isEnabled()
                && u.getUsername() != null
                && u.getAuthorities().stream()
                        .noneMatch(
                                a -> Role.INTERNAL_API_USER.getRoleId().equals(a.getAuthority()));
    }

    /** Reconciles after boot, user creation or restore, outside any caller transaction. */
    public void resolveOwner() {
        reconcile(null);
    }

    public void reconcile(String recoveryUsername) {
        if (saas()) return;
        TransactionTemplate tx = new TransactionTemplate(transactions);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        try {
            tx.executeWithoutResult(
                    status -> {
                        if (!repository.existsById(OrgOwner.SINGLETON_ID)) {
                            entityManager.persist(new OrgOwner());
                            entityManager.flush();
                        }
                    });
        } catch (DataIntegrityViolationException | jakarta.persistence.PersistenceException race) {
            if (!repository.existsById(OrgOwner.SINGLETON_ID)) throw race;
            // A concurrent node created the singleton; locking below reads its committed state.
        }
        tx.executeWithoutResult(
                status -> {
                    OrgOwner row = lockedOwner().orElseThrow();
                    if (recoveryUsername != null) {
                        User target = users.findByUsernameIgnoreCase(recoveryUsername).orElse(null);
                        if (target == null
                                || target.getAuthorities().stream()
                                        .anyMatch(
                                                a ->
                                                        Role.INTERNAL_API_USER
                                                                .getRoleId()
                                                                .equals(a.getAuthority()))) {
                            log.warn(
                                    "Invalid STIRLING_ORG_OWNER_BREAK_GLASS user; ownership unchanged");
                        } else {
                            target.setEnabled(true);
                            promote(target);
                            assign(row, target, "BREAK_GLASS", "system:org-owner");
                            log.warn(
                                    "Ownership recovery applied to {}. Remove STIRLING_ORG_OWNER_BREAK_GLASS before the next restart.",
                                    target.getUsername());
                            return;
                        }
                    }
                    if (validOwner(row).isPresent()) return;
                    List<User> candidates = users.findEnabledAdminsByIdAsc();
                    candidates.stream()
                            .filter(this::eligible)
                            .sorted(
                                    Comparator.comparing(User::isFirstLogin)
                                            .thenComparing(User::getId))
                            .findFirst()
                            .ifPresent(u -> assign(row, u, "RECONCILE", "system:org-owner"));
                });
    }

    /** Creation must commit before reconciliation can see its new admin. */
    public void reconcileAfterCommit() {
        if (saas()) return;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            safeReconcile();
                        }
                    });
        } else {
            safeReconcile();
        }
    }

    public void safeReconcile() {
        try {
            resolveOwner();
        } catch (RuntimeException e) {
            log.warn("Organization owner reconciliation failed; retry at restart", e);
        }
    }

    /** Called within user mutations so transfer and protection checks hold the same lock. */
    @Transactional
    public void protect(Long userId, boolean passwordReset) {
        if (saas()) return;
        lockedOwner()
                .flatMap(this::validOwner)
                .filter(u -> u.getId().equals(userId))
                .ifPresent(
                        u -> {
                            if (!passwordReset
                                    || !isCurrentUser(
                                            SecurityContextHolder.getContext()
                                                    .getAuthentication())) {
                                throw new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Transfer organization ownership before changing this account.");
                            }
                        });
    }

    /** A legitimate rename preserves the restore identity pin under the ownership lock. */
    @Transactional
    public void renamed(Long userId, String username) {
        if (saas()) return;
        lockedOwner()
                .filter(o -> Objects.equals(o.getOwnerUserId(), userId))
                .ifPresent(o -> o.setOwnerUsername(username));
    }

    @Transactional(rollbackFor = Exception.class)
    public void transfer(Long targetId, Authentication authentication) {
        if (saas()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        OrgOwner row =
                lockedOwner()
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.CONFLICT,
                                                "Organization owner is unavailable. Ask the operator to recover ownership."));
        User previous =
                validOwner(row)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.CONFLICT,
                                                "Organization owner is unavailable."));
        if (authentication == null
                || !Objects.equals(previous.getUsername(), authentication.getName()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "orgOwnerRequired");
        if (Objects.equals(previous.getId(), targetId))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose another user.");
        if (targetId == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a user.");
        User target =
                users.findById(targetId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST, "User not found."));
        if (!eligible(target) || target.isFirstLogin())
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Choose an enabled user who has completed first login.");
        if (handovers != null) handovers.validateCompletion(row, targetId);
        promote(target);
        assign(row, target, "TRANSFER", authentication.getName());
    }

    private void promote(User user) {
        if (admin(user)) return;
        Authority authority = authorities.findByUserId(user.getId());
        if (authority == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User has no role.");
        authority.setAuthority(Role.ADMIN.getRoleId());
        authorities.saveAndFlush(authority);
    }

    private void assign(OrgOwner row, User target, String reason, String actor) {
        Map<String, Object> data = new HashMap<>();
        data.put("previousOwnerUserId", row.getOwnerUserId());
        data.put("newOwnerUserId", target.getId());
        data.put("source", reason);
        row.setOwnerUserId(target.getId());
        row.setOwnerUsername(target.getUsername());
        row.setAssignedAt(LocalDateTime.now());
        row.setAssignedReason(reason);
        OwnershipHandoverService.clear(row);
        audit.getObject().audit(actor, AuditEventType.ORG_OWNERSHIP_CHANGE, data, AuditLevel.BASIC);
        log.info("Organization owner is {} ({})", target.getUsername(), reason);
        if (target.isFirstLogin())
            log.warn(
                    "Organization owner {} has not completed first login; complete setup or use operator recovery before transferring ownership",
                    target.getUsername());
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try {
                            database.getObject().exportDatabase();
                        } catch (Exception e) {
                            log.warn("Ownership committed but database backup failed", e);
                        }
                    }
                });
    }
}
