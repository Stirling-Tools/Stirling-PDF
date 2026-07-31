package stirling.software.proprietary.storage.egress;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.storage.model.ShareAccessRole;

/** Reading a policy's untyped options bag as a typed rule, and still coming out usable. */
class EgressRuleTest {

    @Test
    void readsTheSettingsThePortalPersists() {
        EgressRule rule =
                EgressRule.from(
                        sharingPolicy(
                                Map.of(
                                        "categoryId", "sharing",
                                        "sources", List.of("shareLink", "emailShare"),
                                        "fieldValues",
                                                Map.of(
                                                        "defaultAccess", "restricted",
                                                        "externalRecipients", "block",
                                                        "internalDomains",
                                                                List.of("@example.com", "*.co.uk"),
                                                        "linkExpiry", "threeDays",
                                                        "downloads", "viewOnly"))));

        assertEquals(Set.of(ShareChannel.SHARE_LINK, ShareChannel.EMAIL_SHARE), rule.channels());
        assertEquals(ShareAccessRole.VIEWER, rule.maxRole());
        assertEquals(EgressRule.ExternalRecipients.BLOCK, rule.externalRecipients());
        assertEquals(Set.of("example.com", "co.uk"), rule.internalDomains());
        assertEquals(3, rule.maxLinkDays());
        assertTrue(rule.viewOnly());
    }

    @Test
    void anEmptyBagIsAnUnnarrowedRuleThatRestrictsExternalRecipients() {
        EgressRule rule = EgressRule.from(sharingPolicy(Map.of()));

        assertTrue(rule.channels().isEmpty());
        assertNull(rule.maxRole());
        assertNull(rule.maxLinkDays());
        assertFalse(rule.viewOnly());
        // The safe default when the setting is absent, not "allow".
        assertEquals(EgressRule.ExternalRecipients.RESTRICT, rule.externalRecipients());
    }

    @Test
    void unrecognisedValuesFallBackToNoCeilingRatherThanThrowing() {
        EgressRule rule =
                EgressRule.from(
                        sharingPolicy(
                                Map.of(
                                        "sources", List.of("editor", "notAChannel"),
                                        "fieldValues",
                                                Map.of(
                                                        "defaultAccess", "inherit",
                                                        "linkExpiry", "inherit"))));

        assertTrue(rule.channels().isEmpty(), "unknown channel ids are dropped");
        assertNull(rule.maxRole());
        assertNull(rule.maxLinkDays());
    }

    @Test
    void anUnnarrowedRuleCoversEveryChannel() {
        EgressRule rule = EgressRule.from(sharingPolicy(Map.of()));

        assertTrue(rule.covers(ShareChannel.USER_SHARE));
        assertTrue(rule.covers(ShareChannel.SHARE_LINK));
    }

    @Test
    void aNarrowedRuleCoversOnlyItsChannels() {
        EgressRule rule = EgressRule.from(sharingPolicy(Map.of("sources", List.of("shareLink"))));

        assertTrue(rule.covers(ShareChannel.SHARE_LINK));
        assertFalse(rule.covers(ShareChannel.USER_SHARE));
    }

    private static Policy sharingPolicy(Map<String, Object> options) {
        return new Policy(
                "p1",
                "Sharing Policy",
                "owner@example.com",
                true,
                List.of(),
                List.of(new PipelineStep("/api/v1/security/add-watermark", Map.of(), Map.of())),
                new OutputSpec("inline", options),
                List.of(),
                7L);
    }
}
