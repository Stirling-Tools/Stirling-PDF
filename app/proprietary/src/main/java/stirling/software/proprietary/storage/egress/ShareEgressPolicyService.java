package stirling.software.proprietary.storage.egress;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;

import tools.jackson.databind.ObjectMapper;

/** Evaluates the file owner's team's Sharing policies; several compose to the strictest outcome. */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShareEgressPolicyService {

    private final PolicyStore policyStore;
    private final ObjectMapper objectMapper;

    /** Decide a share that is about to be granted. */
    public ShareEgressDecision evaluateGrant(
            ShareChannel channel,
            StoredFile file,
            User owner,
            String recipient,
            ShareAccessRole requestedRole) {
        return evaluate(channel, file, owner, recipient, requestedRole);
    }

    /** Decide a delivery: channel inferred from the share row, recipient is whoever is fetching. */
    public ShareEgressDecision evaluateDelivery(FileShare share, User accessor) {
        StoredFile file = share.getFile();
        User owner = file == null ? null : file.getOwner();
        return evaluate(
                channelOf(share),
                file,
                owner,
                accessor == null ? null : accessor.getUsername(),
                share.getAccessRole());
    }

    /** The channel stamped when the share was granted; older rows fall back to their shape. */
    private static ShareChannel channelOf(FileShare share) {
        if (share.getEgressChannel() != null) {
            return share.getEgressChannel();
        }
        return share.getSharedWithUser() != null
                ? ShareChannel.USER_SHARE
                : ShareChannel.SHARE_LINK;
    }

    private ShareEgressDecision evaluate(
            ShareChannel channel,
            StoredFile file,
            User owner,
            String recipient,
            ShareAccessRole requestedRole) {
        List<EgressRule> rules = rulesFor(owner, channel);
        if (rules.isEmpty()) {
            return ShareEgressDecision.unrestricted(requestedRole);
        }

        ShareAccessRole role = requestedRole;
        Integer maxLinkDays = null;
        boolean viewOnly = false;
        boolean external = false;
        String decidingPolicyId = null;
        String decidingPolicyName = null;
        List<String> transformPolicyIds = new ArrayList<>();
        StringBuilder fingerprintSource = new StringBuilder();

        for (EgressRule rule : rules) {
            boolean ruleSaysExternal = isExternal(recipient, owner, rule);
            external |= ruleSaysExternal;

            if (ruleSaysExternal
                    && rule.externalRecipients() == EgressRule.ExternalRecipients.BLOCK) {
                log.info(
                        "Sharing policy {} blocked egress of file {} to an external recipient",
                        rule.policyId(),
                        file == null ? null : file.getId());
                return ShareEgressDecision.blocked(
                        rule, "This document may not be shared outside your organisation");
            }

            // "Restrict" is the tightest terms the rule can express: read-only, no download, and
            // the shortest link life, so an external party gets a look rather than a working copy.
            boolean restrictExternal =
                    ruleSaysExternal
                            && rule.externalRecipients() == EgressRule.ExternalRecipients.RESTRICT;

            role = tightest(role, restrictExternal ? ShareAccessRole.VIEWER : rule.maxRole());
            // Integer.valueOf, not a bare 1: a mixed int/Integer ternary unboxes, so a rule with no
            // configured expiry would NPE here.
            maxLinkDays =
                    shortest(
                            maxLinkDays,
                            restrictExternal ? Integer.valueOf(1) : rule.maxLinkDays());
            viewOnly |= rule.viewOnly() || restrictExternal;
            if (!rule.steps().isEmpty()) {
                transformPolicyIds.add(rule.policyId());
                fingerprintSource
                        .append(rule.policyId())
                        .append('|')
                        .append(objectMapper.writeValueAsString(rule.steps()))
                        .append('\n');
            }
            decidingPolicyId = rule.policyId();
            decidingPolicyName = rule.policyName();
        }

        if (decidingPolicyId == null) {
            return ShareEgressDecision.unrestricted(requestedRole);
        }
        // View-only rasterises the copy even with no tool chain, so it is processed too and needs a
        // fingerprint of its own to cache under.
        if (viewOnly) {
            fingerprintSource.append("viewOnly\n");
        }
        String fingerprint =
                transformPolicyIds.isEmpty() && !viewOnly
                        ? null
                        : fingerprint(fingerprintSource.toString(), sourceVersion(file));
        return new ShareEgressDecision(
                true,
                null,
                role,
                maxLinkDays,
                viewOnly,
                external,
                decidingPolicyId,
                decidingPolicyName,
                List.copyOf(transformPolicyIds),
                fingerprint);
    }

    /** The owner's team's enabled sharing policies that govern this channel, in run order. */
    private List<EgressRule> rulesFor(User owner, ShareChannel channel) {
        Long ownerTeamId =
                owner != null && owner.getTeam() != null ? owner.getTeam().getId() : null;
        List<EgressRule> rules = new ArrayList<>();
        for (Policy policy : policyStore.findByTeam(ownerTeamId)) {
            if (!policy.enabled() || !EgressRule.governsSharing(policy)) {
                continue;
            }
            EgressRule rule = EgressRule.from(policy);
            if (rule.covers(channel)) {
                rules.add(rule);
            }
        }
        return rules;
    }

    /** Inside = the rule's domains, else the owner's. No domain reads as internal. */
    private static boolean isExternal(String recipient, User owner, EgressRule rule) {
        String recipientDomain = domainOf(recipient);
        if (recipientDomain == null) {
            return false;
        }
        Set<String> internal = rule.internalDomains();
        if (internal.isEmpty()) {
            String ownerDomain = owner == null ? null : domainOf(owner.getUsername());
            return ownerDomain != null && !ownerDomain.equals(recipientDomain);
        }
        return !internal.contains(recipientDomain);
    }

    private static String domainOf(String address) {
        if (address == null) {
            return null;
        }
        int at = address.lastIndexOf('@');
        if (at < 0 || at == address.length() - 1) {
            return null;
        }
        return address.substring(at + 1).trim().toLowerCase(Locale.ROOT);
    }

    /** The more restrictive of two roles; a null ceiling leaves the current role alone. */
    private static ShareAccessRole tightest(ShareAccessRole current, ShareAccessRole ceiling) {
        if (ceiling == null) {
            return current;
        }
        if (current == null) {
            return ceiling;
        }
        // Declaration order is EDITOR, COMMENTER, VIEWER — least to most restrictive.
        return current.ordinal() >= ceiling.ordinal() ? current : ceiling;
    }

    private static Integer shortest(Integer current, Integer candidate) {
        if (candidate == null) {
            return current;
        }
        return current == null ? candidate : Math.min(current, candidate);
    }

    /** Changes whenever the document is replaced, so a cached processed copy goes stale with it. */
    private static String sourceVersion(StoredFile file) {
        if (file == null) {
            return "none";
        }
        return file.getId() + ":" + file.getUpdatedAt() + ":" + file.getSizeBytes();
    }

    private static String fingerprint(String chain, String sourceVersion) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest((chain + sourceVersion).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by the Java platform", e);
        }
    }
}
