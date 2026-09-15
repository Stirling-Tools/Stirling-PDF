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
            Long targetId, String targetName, String targetEmail, CloudOwnershipStatus cloud) {}

    /** Persists one successor per owner; retries cannot replace the recipient or cloud team. */
    @Transactional
    public Status prepare(Long targetId, Authentication auth) {
        OrgOwner owner = requireOwner(auth);
        User target = target(targetId);
        if (Objects.equals(targetId, owner.getOwnerUserId())) throw conflict("CHOOSE_ANOTHER_USER");
        if (owner.getHandoverTargetId() != null
                && !Objects.equals(owner.getHandoverTargetId(), targetId)) {
            throw conflict("HANDOVER_IN_PROGRESS");
        }
        if (owner.getHandoverTargetId() == null) {
            owner.setHandoverTargetId(targetId);
            owner.setHandoverTargetUsername(target.getUsername());
            owner.setHandoverTargetEmail(target.getEmail());
            var credential = credentials.findCredential();
            if (credential.isPresent()) {
                owner.setHandoverDeviceId(credential.get().getDeviceId());
                owner.setHandoverTeamId(credential.get().getTeamId());
                CloudOwnershipStatus cloud =
                        remote(credential.get(), target.getEmail(), null, "status", null);
                verifyTeam(owner, cloud);
                owner.setHandoverLeaderId(cloud.leaderUserId());
            }
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
                        null);
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
                current.targetEmail(),
                bearer,
                action,
                owner.getHandoverLeaderId());
        return status(owner);
    }

    /**
     * Cancellation cannot abandon a completed cloud transfer; an unreachable cloud fails closed.
     */
    @Transactional
    public void cancel(Authentication auth) {
        OrgOwner owner = requireOwner(auth);
        if (owner.getHandoverTargetId() == null) return;
        DeviceCredential credential = credential(owner);
        CloudOwnershipStatus cloud =
                credential == null
                        ? null
                        : remote(credential, owner.getHandoverTargetEmail(), null, "status", null);
        if (cloud != null && cloud.state() == CloudOwnershipStatus.State.TRANSFERRED) {
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
                        : remote(credential, owner.getHandoverTargetEmail(), null, "status", null);
        if (cloud != null) verifyTeam(owner, cloud);
        return new Status(target.getId(), target.getUsername(), target.getEmail(), cloud);
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
        if (auth == null
                || !auth.isAuthenticated()
                || !Objects.equals(owner.getOwnerUsername(), auth.getName())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "ORG_OWNER_REQUIRED");
        }
        users.findById(owner.getOwnerUserId())
                .filter(
                        u ->
                                u.isEnabled()
                                        && !u.isFirstLogin()
                                        && Objects.equals(u.getUsername(), auth.getName())
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
            DeviceCredential credential, String email, String bearer, String action, Long leader) {
        if (email == null || email.isBlank()) throw conflict("EMAIL_REQUIRED");
        AccountLinkClient upstream = client.getIfAvailable();
        if (upstream == null)
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "CLOUD_UNAVAILABLE");
        try {
            return upstream.ownership(credential, email, bearer, action, leader);
        } catch (AccountLinkClient.UpstreamException e) {
            String reason =
                    switch (e.status()) {
                        case 401 ->
                                "status".equals(action) ? "LINK_CHANGED" : "CLOUD_SIGN_IN_REQUIRED";
                        case 403 ->
                                "status".equals(action) ? "LINK_CHANGED" : "CLOUD_OWNER_REQUIRED";
                        case 400 -> "INVITATION_BLOCKED";
                        case 409 -> "CLOUD_OWNER_CHANGED";
                        default -> "CLOUD_UNAVAILABLE";
                    };
            throw new ResponseStatusException(HttpStatus.CONFLICT, reason);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "CLOUD_UNAVAILABLE");
        }
    }

    private ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}
