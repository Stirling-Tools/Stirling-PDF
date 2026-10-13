package stirling.software.proprietary.service;

import java.io.IOException;
import java.util.Objects;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.accountlink.*;
import stirling.software.proprietary.model.OrgOwner;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.OrgOwnerRepository;

/**
 * Pins the local successor and server link until live cloud leadership permits local completion.
 */
@Service
@Profile("!saas")
@RequiredArgsConstructor
public class OwnershipHandoverService {
    private final OrgOwnerRepository owners;
    private final UserRepository users;
    private final DeviceCredentialRepository credentials;
    private final ObjectProvider<AccountLinkClient> client;

    public record Status(
            Long targetId,
            String targetName,
            String targetEmail,
            CloudOwnershipStatus cloud,
            CloudOwnershipCandidates candidates,
            String cloudEmail) {
        public Status(
                Long targetId, String targetName, String targetEmail, CloudOwnershipStatus cloud) {
            this(targetId, targetName, targetEmail, cloud, null, targetEmail);
        }
    }

    public record Selection(
            Long cloudUserId, @jakarta.validation.constraints.Email String cloudEmail) {}

    /** Persists one successor per owner; retries cannot replace the recipient or cloud team. */
    @Transactional
    public Status prepare(Long targetId, Authentication auth) {
        return prepare(targetId, null, auth);
    }

    /**
     * No intent is persisted for a linked server until the owner explicitly chooses a cloud
     * account.
     */
    @Transactional
    public Status prepare(Long targetId, Selection selection, Authentication auth) {
        OrgOwner owner = requireOwner(auth);
        if (owner.getHandoverTargetId() != null
                && !Objects.equals(owner.getHandoverTargetId(), targetId)) {
            throw conflict("HANDOVER_IN_PROGRESS");
        }
        User target = target(targetId);
        if (Objects.equals(targetId, owner.getOwnerUserId())) throw conflict("CHOOSE_ANOTHER_USER");
        if (owner.getHandoverTargetId() == null) {
            var credential = credentials.findCredential();
            String cloudEmail = null;
            Long cloudUserId = null;
            CloudOwnershipStatus cloud = null;
            if (credential.isPresent()) {
                CloudOwnershipCandidates candidates = candidates(credential.get());
                if (!Objects.equals(candidates.teamId(), credential.get().getTeamId()))
                    throw conflict("LINK_CHANGED");
                if (selection == null
                        || (selection.cloudUserId() == null
                                && (selection.cloudEmail() == null
                                        || selection.cloudEmail().isBlank()))) {
                    return new Status(
                            targetId,
                            target.getUsername(),
                            target.getEmail(),
                            null,
                            candidates,
                            null);
                }
                if (selection.cloudUserId() != null) {
                    var member =
                            candidates.members().stream()
                                    .filter(m -> Objects.equals(m.id(), selection.cloudUserId()))
                                    .findFirst()
                                    .orElseThrow(() -> conflict("CLOUD_TARGET_CHANGED"));
                    cloudEmail = member.email();
                    cloudUserId = member.id();
                } else {
                    cloudEmail = selection.cloudEmail().strip().toLowerCase(java.util.Locale.ROOT);
                    if (!cloudEmail.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
                        throw conflict("CLOUD_EMAIL_REQUIRED");
                }
                cloud = remote(credential.get(), cloudEmail, null, "status", null, cloudUserId);
                if (!Objects.equals(cloud.teamId(), credential.get().getTeamId()))
                    throw conflict("LINK_CHANGED");
                if (cloud.state() == CloudOwnershipStatus.State.TRANSFERRED)
                    throw conflict("CHOOSE_ANOTHER_CLOUD_USER");
                cloudUserId = cloud.targetUserId();
            }
            owner.setHandoverTargetId(targetId);
            owner.setHandoverTargetUsername(target.getUsername());
            owner.setHandoverTargetEmail(target.getEmail());
            owner.setHandoverCloudEmail(cloudEmail);
            owner.setHandoverCloudUserId(cloudUserId);
            if (credential.isPresent()) {
                owner.setHandoverDeviceId(credential.get().getDeviceId());
                owner.setHandoverTeamId(credential.get().getTeamId());
                verifyTeam(owner, cloud);
                owner.setHandoverLeaderId(cloud.leaderUserId());
            }
        } else if (selection != null
                && ((selection.cloudUserId() != null
                                && !Objects.equals(
                                        selection.cloudUserId(), owner.getHandoverCloudUserId()))
                        || (selection.cloudEmail() != null
                                && !selection.cloudEmail().equalsIgnoreCase(cloudEmail(owner))))) {
            throw conflict("HANDOVER_IN_PROGRESS");
        }
        return status(owner);
    }

    /** Returns the durable intent without contacting SaaS, including during an upstream outage. */
    @Transactional
    public Status current(Authentication auth) {
        OrgOwner owner = requireOwner(auth);
        return owner.getHandoverTargetId() == null
                ? null
                : new Status(
                        owner.getHandoverTargetId(),
                        owner.getHandoverTargetUsername(),
                        owner.getHandoverTargetEmail(),
                        null,
                        null,
                        cloudEmail(owner));
    }

    /** Reading alternative cloud accounts never cancels or replaces a saved handover. */
    @Transactional
    public CloudOwnershipCandidates members(Authentication auth) {
        OrgOwner owner = requireOwner(auth);
        DeviceCredential credential =
                owner.getHandoverTargetId() == null
                        ? credentials.findCredential().orElseThrow(() -> conflict("NOT_LINKED"))
                        : credential(owner);
        if (credential == null) throw conflict("NOT_LINKED");
        return candidates(credential);
    }

    /**
     * The bearer is forwarded for this request only; SaaS must authorize its current team owner.
     */
    @Transactional
    public Status changeCloud(Authentication auth, String bearer, String action) {
        OrgOwner owner = requireOwner(auth);
        Status current = status(owner);
        if (current.cloud() == null) throw conflict("NOT_LINKED");
        if (current.cloud().state() == CloudOwnershipStatus.State.TRANSFERRED) return current;
        if (bearer == null || !bearer.startsWith("Bearer ")) {
            throw conflict("CLOUD_SIGN_IN_REQUIRED");
        }
        remote(
                credential(owner),
                cloudEmail(owner),
                bearer,
                action,
                owner.getHandoverLeaderId(),
                owner.getHandoverCloudUserId());
        return status(owner);
    }

    /**
     * Cancellation preserves a completed cloud transfer or an unknown outcome. An authoritative
     * denial of the pinned device link permits abandoning the now-disconnected handover.
     */
    @Transactional
    public void cancel(Authentication auth) {
        OrgOwner owner = requireOwner(auth);
        if (owner.getHandoverTargetId() == null) return;
        DeviceCredential credential = credential(owner);
        CloudOwnershipStatus cloud;
        try {
            cloud =
                    credential == null
                            ? null
                            : remote(credential, cloudEmail(owner), null, "status", null, null);
        } catch (ResponseStatusException e) {
            if (!"LINK_REVOKED".equals(e.getReason())) throw e;
            clear(owner);
            return;
        }
        if (cloud != null
                && (owner.getHandoverCloudUserId() == null
                        ? cloud.state() == CloudOwnershipStatus.State.TRANSFERRED
                        : Objects.equals(owner.getHandoverCloudUserId(), cloud.leaderUserId()))) {
            throw conflict("FINISH_LOCAL_TRANSFER");
        }
        clear(owner);
    }

    /**
     * Also called by the original transfer endpoint, so bypassing the wizard cannot skip cloud
     * ownership.
     */
    public void validateCompletion(OrgOwner owner, Long targetId) {
        boolean linked = credentials.findCredential().isPresent();
        if (linked) requireClient();
        if (!linked && owner.getHandoverTargetId() == null) return;
        if (!Objects.equals(owner.getHandoverTargetId(), targetId))
            throw conflict("PREPARE_HANDOVER_FIRST");
        Status state = status(owner);
        if (state.cloud() != null
                && state.cloud().state() != CloudOwnershipStatus.State.TRANSFERRED) {
            throw conflict("CLOUD_TRANSFER_REQUIRED");
        }
    }

    /**
     * Clears only the local handover record; licenses, credentials and cloud membership are
     * untouched.
     */
    public static void clear(OrgOwner owner) {
        owner.setHandoverTargetId(null);
        owner.setHandoverTargetUsername(null);
        owner.setHandoverTargetEmail(null);
        owner.setHandoverCloudEmail(null);
        owner.setHandoverCloudUserId(null);
        owner.setHandoverDeviceId(null);
        owner.setHandoverTeamId(null);
        owner.setHandoverLeaderId(null);
    }

    private Status status(OrgOwner owner) {
        User target = target(owner.getHandoverTargetId());
        if (!Objects.equals(owner.getHandoverTargetUsername(), target.getUsername())
                || !Objects.equals(owner.getHandoverTargetEmail(), target.getEmail())) {
            throw conflict("TARGET_CHANGED");
        }
        DeviceCredential credential = credential(owner);
        CloudOwnershipStatus cloud =
                credential == null
                        ? null
                        : remote(
                                credential,
                                cloudEmail(owner),
                                null,
                                "status",
                                null,
                                owner.getHandoverCloudUserId());
        if (cloud != null) {
            verifyTeam(owner, cloud);
            if (owner.getHandoverCloudUserId() == null && cloud.targetUserId() != null) {
                owner.setHandoverCloudUserId(cloud.targetUserId());
            }
        }
        return new Status(
                target.getId(),
                target.getUsername(),
                target.getEmail(),
                cloud,
                null,
                cloudEmail(owner));
    }

    private String cloudEmail(OrgOwner owner) {
        return owner.getHandoverCloudEmail() != null
                ? owner.getHandoverCloudEmail()
                : owner.getHandoverTargetEmail();
    }

    private CloudOwnershipCandidates candidates(DeviceCredential credential) {
        AccountLinkClient upstream = requireClient();
        try {
            return upstream.ownershipCandidates(credential);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "CLOUD_UNAVAILABLE");
        }
    }

    private DeviceCredential credential(OrgOwner owner) {
        DeviceCredential credential = credentials.findCredential().orElse(null);
        if (!Objects.equals(
                        owner.getHandoverDeviceId(),
                        credential == null ? null : credential.getDeviceId())
                || !Objects.equals(
                        owner.getHandoverTeamId(),
                        credential == null ? null : credential.getTeamId())) {
            throw conflict("LINK_CHANGED");
        }
        return credential;
    }

    private void verifyTeam(OrgOwner owner, CloudOwnershipStatus cloud) {
        if (!Objects.equals(owner.getHandoverTeamId(), cloud.teamId()))
            throw conflict("LINK_CHANGED");
    }

    private OrgOwner requireOwner(Authentication auth) {
        OrgOwner owner = owners.lockOwner().orElseThrow(() -> conflict("OWNER_UNAVAILABLE"));
        if (auth == null || !auth.isAuthenticated() || auth.getName() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "ORG_OWNER_REQUIRED");
        }
        Long authenticatedId =
                auth.getPrincipal() instanceof User principal
                        ? principal.getId()
                        : users.findByUsername(auth.getName()).map(User::getId).orElse(null);
        if (authenticatedId == null || !Objects.equals(authenticatedId, owner.getOwnerUserId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "ORG_OWNER_REQUIRED");
        }
        users.findById(authenticatedId)
                .filter(
                        u ->
                                u.isEnabled()
                                        && !u.isFirstLogin()
                                        && u.getAuthorities().stream()
                                                .anyMatch(
                                                        a ->
                                                                Role.ADMIN
                                                                        .getRoleId()
                                                                        .equals(a.getAuthority())))
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.FORBIDDEN, "ORG_OWNER_REQUIRED"));
        return owner;
    }

    private User target(Long id) {
        if (id == null) throw conflict("PREPARE_HANDOVER_FIRST");
        return users.findById(id)
                .filter(
                        u ->
                                u.isEnabled()
                                        && !u.isFirstLogin()
                                        && u.getAuthorities().stream()
                                                .noneMatch(
                                                        a ->
                                                                Role.INTERNAL_API_USER
                                                                        .getRoleId()
                                                                        .equals(a.getAuthority())))
                .orElseThrow(() -> conflict("TARGET_UNAVAILABLE"));
    }

    private CloudOwnershipStatus remote(
            DeviceCredential credential,
            String email,
            String bearer,
            String action,
            Long leader,
            Long targetUserId) {
        if (email == null || email.isBlank()) throw conflict("EMAIL_REQUIRED");
        AccountLinkClient upstream = requireClient();
        try {
            CloudOwnershipStatus status =
                    upstream.ownership(credential, email, bearer, action, leader, targetUserId);
            if (targetUserId != null && !Objects.equals(targetUserId, status.targetUserId()))
                throw conflict("CLOUD_TARGET_CHANGED");
            return status;
        } catch (AccountLinkClient.UpstreamException e) {
            String reason =
                    switch (e.status()) {
                        case 401 ->
                                "status".equals(action) ? "LINK_REVOKED" : "CLOUD_SIGN_IN_REQUIRED";
                        case 403 ->
                                "status".equals(action) ? "LINK_REVOKED" : "CLOUD_OWNER_REQUIRED";
                        case 404 ->
                                "status".equals(action) && "CLOUD_TEAM_MISSING".equals(e.reason())
                                        ? "LINK_REVOKED"
                                        : "CLOUD_UNAVAILABLE";
                        case 400 ->
                                "PERSONAL_TEAM".equals(e.reason())
                                        ? "PERSONAL_TEAM"
                                        : "INVITATION_BLOCKED";
                        case 409 ->
                                switch (String.valueOf(e.reason())) {
                                    case "CLOUD_TARGET_CHANGED", "MEMBERSHIP_REQUIRED" ->
                                            e.reason();
                                    default -> "CLOUD_OWNER_CHANGED";
                                };
                        default -> "CLOUD_UNAVAILABLE";
                    };
            throw new ResponseStatusException(HttpStatus.CONFLICT, reason);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "CLOUD_UNAVAILABLE");
        }
    }

    private AccountLinkClient requireClient() {
        AccountLinkClient upstream = client.getIfAvailable();
        if (upstream == null) throw conflict("ACCOUNT_LINK_DISABLED");
        return upstream;
    }

    private ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}
