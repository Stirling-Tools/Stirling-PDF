package stirling.software.proprietary.storage.egress;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;

import tools.jackson.databind.json.JsonMapper;

/** The egress decision: who a share may go to, on what terms, and what must be processed. */
class ShareEgressPolicyServiceTest {

    private static final Long TEAM = 7L;
    private static final String WATERMARK = "/api/v1/security/add-watermark";

    private PolicyStore policyStore;
    private ShareEgressPolicyService service;
    private User owner;
    private StoredFile file;

    @BeforeEach
    void setUp() {
        policyStore = new InProcessPolicyStore();
        service = new ShareEgressPolicyService(policyStore, JsonMapper.builder().build());
        owner = user("alice@example.com", TEAM);
        file = storedFile(owner);
    }

    @Test
    void withNoSharingPolicyNothingChanges() {
        ShareEgressDecision decision = grant("bob@partner.com", ShareAccessRole.EDITOR);

        assertTrue(decision.allowed());
        assertEquals(ShareAccessRole.EDITOR, decision.role());
        assertNull(decision.maxLinkDays());
        assertFalse(decision.viewOnly());
        assertFalse(decision.transforms());
        assertNull(decision.policyId());
    }

    @Test
    void anotherTeamsSharingPolicyDoesNotGovernThisOwner() {
        savePolicy(sharing(Map.of("defaultAccess", "restricted"), List.of(), 99L));

        assertEquals(
                ShareAccessRole.EDITOR, grant("bob@example.com", ShareAccessRole.EDITOR).role());
    }

    @Test
    void aPolicyFromAnotherCategoryDoesNotGovernEgress() {
        policyStore.save(
                new Policy(
                        null,
                        "Security Policy",
                        owner.getUsername(),
                        true,
                        List.of(),
                        List.of(new PipelineStep(WATERMARK, Map.of(), Map.of())),
                        new OutputSpec(
                                "inline",
                                Map.of(
                                        "categoryId",
                                        "security",
                                        "fieldValues",
                                        Map.of("externalRecipients", "block"))),
                        TEAM));

        assertTrue(grant("bob@partner.com", ShareAccessRole.EDITOR).allowed());
    }

    @Test
    void adisabledPolicyDoesNotGovernAnything() {
        Policy policy = sharing(Map.of("externalRecipients", "block"), List.of(), TEAM);
        policyStore.save(
                new Policy(
                        policy.id(),
                        policy.name(),
                        policy.owner(),
                        false,
                        policy.inputs(),
                        policy.steps(),
                        policy.output(),
                        policy.outputIds(),
                        policy.teamId()));

        assertTrue(grant("bob@partner.com", ShareAccessRole.EDITOR).allowed());
    }

    @Test
    void defaultAccessCapsTheRoleAShareMayGrant() {
        savePolicy(
                sharing(
                        Map.of("defaultAccess", "restricted", "externalRecipients", "allow"),
                        List.of(),
                        TEAM));

        assertEquals(
                ShareAccessRole.VIEWER, grant("bob@example.com", ShareAccessRole.EDITOR).role());
    }

    @Test
    void theCapOnlyTightens_itNeverPromotesAWeakerRequest() {
        savePolicy(
                sharing(
                        Map.of("defaultAccess", "editor", "externalRecipients", "allow"),
                        List.of(),
                        TEAM));

        assertEquals(
                ShareAccessRole.VIEWER, grant("bob@example.com", ShareAccessRole.VIEWER).role());
    }

    @Test
    void blockingExternalRecipientsRefusesTheShareAndNamesThePolicy() {
        savePolicy(sharing(Map.of("externalRecipients", "block"), List.of(), TEAM));

        ShareEgressDecision decision = grant("bob@partner.com", ShareAccessRole.EDITOR);

        assertFalse(decision.allowed());
        assertTrue(decision.external());
        assertNotNull(decision.reason());
        assertEquals("Sharing Policy", decision.policyName());
    }

    @Test
    void aRecipientOnTheOwnersOwnDomainIsInternalWhenNoDomainsAreConfigured() {
        savePolicy(sharing(Map.of("externalRecipients", "block"), List.of(), TEAM));

        ShareEgressDecision decision = grant("bob@example.com", ShareAccessRole.EDITOR);

        assertTrue(decision.allowed());
        assertFalse(decision.external());
    }

    @Test
    void configuredInternalDomainsWinOverTheOwnersOwn() {
        savePolicy(
                sharing(
                        Map.of(
                                "externalRecipients",
                                "block",
                                "internalDomains",
                                List.of("partner.com")),
                        List.of(),
                        TEAM));

        // partner.com is now inside; the owner's own example.com is not.
        assertTrue(grant("bob@partner.com", ShareAccessRole.EDITOR).allowed());
        assertFalse(grant("bob@example.com", ShareAccessRole.EDITOR).allowed());
    }

    @Test
    void aBareUsernameWithNoDomainIsTreatedAsInternal() {
        savePolicy(sharing(Map.of("externalRecipients", "block"), List.of(), TEAM));

        // Only a registered local user can hold one, so there is nothing external about it.
        assertTrue(grant("bob", ShareAccessRole.EDITOR).allowed());
    }

    @Test
    void restrictingExternalRecipientsGivesReadOnlyViewOnlyAccessOnAOneDayLink() {
        savePolicy(sharing(Map.of("externalRecipients", "restrict"), List.of(), TEAM));

        ShareEgressDecision decision = grant("bob@partner.com", ShareAccessRole.EDITOR);

        assertTrue(decision.allowed());
        assertTrue(decision.external());
        assertEquals(ShareAccessRole.VIEWER, decision.role());
        assertTrue(decision.viewOnly());
        assertEquals(1, decision.maxLinkDays());
    }

    @Test
    void restrictLeavesInternalRecipientsAlone() {
        savePolicy(sharing(Map.of("externalRecipients", "restrict"), List.of(), TEAM));

        ShareEgressDecision decision = grant("bob@example.com", ShareAccessRole.EDITOR);

        assertFalse(decision.viewOnly());
        assertNull(decision.maxLinkDays());
    }

    @Test
    void aPolicyNarrowedToOneChannelIgnoresTheOthers() {
        savePolicy(sharing(Map.of("externalRecipients", "block"), List.of("shareLink"), TEAM));

        assertTrue(
                service.evaluateGrant(
                                ShareChannel.USER_SHARE,
                                file,
                                owner,
                                "bob@partner.com",
                                ShareAccessRole.EDITOR)
                        .allowed());
        assertFalse(
                service.evaluateGrant(
                                ShareChannel.SHARE_LINK,
                                file,
                                owner,
                                "bob@partner.com",
                                ShareAccessRole.EDITOR)
                        .allowed());
    }

    @Test
    void severalPoliciesComposeToTheMostRestrictiveOutcome() {
        savePolicy(
                sharing(
                        Map.of(
                                "defaultAccess", "commenter",
                                "externalRecipients", "allow",
                                "linkExpiry", "thirtyDays"),
                        List.of(),
                        TEAM));
        savePolicy(
                sharing(
                        Map.of(
                                "defaultAccess", "inherit",
                                "externalRecipients", "allow",
                                "linkExpiry", "threeDays",
                                "downloads", "viewOnly"),
                        List.of(),
                        TEAM));

        ShareEgressDecision decision = grant("bob@example.com", ShareAccessRole.EDITOR);

        assertEquals(ShareAccessRole.COMMENTER, decision.role());
        assertEquals(3, decision.maxLinkDays());
        assertTrue(decision.viewOnly());
    }

    @Test
    void aPolicyWithStepsMarksTheCopyForProcessing() {
        Policy saved = savePolicy(sharing(Map.of(), List.of(), TEAM));

        ShareEgressDecision decision = grant("bob@example.com", ShareAccessRole.VIEWER);

        assertTrue(decision.transforms());
        assertEquals(List.of(saved.id()), decision.transformPolicyIds());
        assertNotNull(decision.transformFingerprint());
        assertTrue(decision.requiresManagedDelivery());
    }

    @Test
    void viewOnlyWithNoStepsStillProcessesTheCopyThatLeaves() {
        policyStore.save(stepless(Map.of("downloads", "viewOnly")));

        ShareEgressDecision decision = grant("bob@example.com", ShareAccessRole.VIEWER);

        assertTrue(decision.viewOnly());
        assertFalse(decision.transforms());
        // The rasterising pass is what makes view-only mean anything, so it caches like a chain.
        assertNotNull(decision.transformFingerprint());
        assertTrue(decision.requiresManagedDelivery());
    }

    @Test
    void aPolicyWithNoStepsAndNoViewOnlyGovernsAccessWithoutTouchingTheBytes() {
        policyStore.save(stepless(Map.of("defaultAccess", "restricted")));

        ShareEgressDecision decision = grant("bob@example.com", ShareAccessRole.VIEWER);

        assertFalse(decision.viewOnly());
        assertFalse(decision.transforms());
        assertNull(decision.transformFingerprint());
        assertFalse(decision.requiresManagedDelivery());
    }

    @Test
    void anEmailShareIsStillJudgedAsOneWhenTheLinkItMintedIsOpened() {
        savePolicy(sharing(Map.of("externalRecipients", "block"), List.of("emailShare"), TEAM));
        FileShare share = new FileShare();
        share.setFile(file);
        share.setShareToken("token");
        share.setAccessRole(ShareAccessRole.VIEWER);
        share.setEgressChannel(ShareChannel.EMAIL_SHARE);

        // Without the stamped channel this reads as a plain link share and the policy never bites.
        assertFalse(service.evaluateDelivery(share, user("bob@partner.com", 99L)).allowed());
    }

    @Test
    void aLinkShareIsNotGovernedByAnEmailOnlyPolicy() {
        savePolicy(sharing(Map.of("externalRecipients", "block"), List.of("emailShare"), TEAM));
        FileShare share = new FileShare();
        share.setFile(file);
        share.setShareToken("token");
        share.setAccessRole(ShareAccessRole.VIEWER);
        share.setEgressChannel(ShareChannel.SHARE_LINK);

        assertTrue(service.evaluateDelivery(share, user("bob@partner.com", 99L)).allowed());
    }

    @Test
    void aUserShareIsJudgedOnTheUserShareChannel() {
        savePolicy(sharing(Map.of("externalRecipients", "block"), List.of("userShare"), TEAM));
        FileShare share = new FileShare();
        share.setFile(file);
        share.setSharedWithUser(user("bob@partner.com", 99L));
        share.setAccessRole(ShareAccessRole.VIEWER);
        share.setEgressChannel(ShareChannel.USER_SHARE);

        assertFalse(service.evaluateDelivery(share, user("bob@partner.com", 99L)).allowed());
    }

    @Test
    void theFingerprintChangesWhenTheDocumentIsReplaced() {
        savePolicy(sharing(Map.of(), List.of(), TEAM));
        String before = grant("bob@example.com", ShareAccessRole.VIEWER).transformFingerprint();

        file.setUpdatedAt(file.getUpdatedAt().plusMinutes(1));
        file.setSizeBytes(999L);

        assertFalse(
                before.equals(
                        grant("bob@example.com", ShareAccessRole.VIEWER).transformFingerprint()));
    }

    @Test
    void deliveryOfALinkShareIsJudgedAgainstWhoeverOpensIt() {
        savePolicy(sharing(Map.of("externalRecipients", "block"), List.of(), TEAM));
        FileShare share = new FileShare();
        share.setFile(file);
        share.setShareToken("token");
        share.setAccessRole(ShareAccessRole.VIEWER);

        assertFalse(service.evaluateDelivery(share, user("bob@partner.com", 99L)).allowed());
        assertTrue(service.evaluateDelivery(share, user("bob@example.com", TEAM)).allowed());
    }

    private ShareEgressDecision grant(String recipient, ShareAccessRole role) {
        return service.evaluateGrant(ShareChannel.USER_SHARE, file, owner, recipient, role);
    }

    private Policy savePolicy(Policy policy) {
        return policyStore.save(policy);
    }

    /** A Sharing policy that governs access only: no tool chain to run over the copy. */
    private Policy stepless(Map<String, Object> fieldValues) {
        return new Policy(
                null,
                "Sharing Policy",
                owner.getUsername(),
                true,
                List.of(),
                List.of(),
                new OutputSpec(
                        "inline", Map.of("categoryId", "sharing", "fieldValues", fieldValues)),
                TEAM);
    }

    private Policy sharing(Map<String, Object> fieldValues, List<String> channels, Long teamId) {
        return new Policy(
                null,
                "Sharing Policy",
                owner.getUsername(),
                true,
                List.of(),
                List.of(new PipelineStep(WATERMARK, Map.of(), Map.of())),
                new OutputSpec(
                        "inline",
                        Map.of(
                                "categoryId", "sharing",
                                "sources", channels,
                                "fieldValues", fieldValues)),
                List.of(),
                teamId);
    }

    private static User user(String username, Long teamId) {
        User user = new User();
        user.setId(Math.abs((long) username.hashCode()));
        user.setUsername(username);
        Team team = new Team();
        team.setId(teamId);
        team.setName("Team " + teamId);
        user.setTeam(team);
        return user;
    }

    private static StoredFile storedFile(User owner) {
        StoredFile file = new StoredFile();
        file.setId(1L);
        file.setOwner(owner);
        file.setOriginalFilename("contract.pdf");
        file.setSizeBytes(1024L);
        file.setStorageKey("key");
        file.setUpdatedAt(LocalDateTime.of(2026, 7, 30, 12, 0));
        return file;
    }
}
