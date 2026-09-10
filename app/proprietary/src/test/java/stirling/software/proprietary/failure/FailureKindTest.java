package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static stirling.software.proprietary.failure.FailureActionSlot.OVERFLOW;
import static stirling.software.proprietary.failure.FailureActionSlot.RESOLUTION;
import static stirling.software.proprietary.failure.FailureActionSlot.SECONDARY;
import static stirling.software.proprietary.failure.FailureAudience.ANYONE_WHO_SEES;
import static stirling.software.proprietary.failure.FailureAudience.OWNER;
import static stirling.software.proprietary.failure.FailureAudience.TEAM_REVIEWER;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import stirling.software.common.util.ExceptionUtils;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Tests for {@link FailureKind}. Mostly invariants over the whole enum rather than assertions about
 * individual members, so a kind added later cannot be malformed in a way that only shows up as a
 * button that fails at runtime.
 */
class FailureKindTest {

    /** Located by walking up, so a test does not depend on the directory Gradle runs it in. */
    private static Path repoFile(String relative) {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path candidate = dir.resolve(relative);
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException(
                "No " + relative + " above " + Path.of("").toAbsolutePath());
    }

    /** In full, so a declaration pairing the right action with the wrong audience cannot pass. */
    private static FailureKind.OfferedAction offered(
            FailureActionId id,
            FailureAudience audience,
            FailureActionSlot slot,
            String labelKeySuffix) {
        return new FailureKind.OfferedAction(
                id, "portal.failures.action." + labelKeySuffix, audience, slot);
    }

    @Nested
    @DisplayName("every kind is well formed")
    class Invariants {

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void hasAllFacetsAndAtLeastOneAction(FailureKind kind) {
            assertThat(kind.getStage()).isNotNull();
            assertThat(kind.getSeverity()).isNotNull();
            assertThat(kind.getRemedy()).isNotNull();
            assertThat(kind.getScope()).isNotNull();
            assertThat(kind.getActions())
                    .as("a kind with no actions cannot be triaged at all")
                    .isNotEmpty();
        }

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void hasCopyKeysAndAnEnglishFallback(FailureKind kind) {
            assertThat(kind.getTitleKey()).isNotBlank();
            assertThat(kind.getDescriptionKey()).isNotBlank();
            // The fallback is what lets a client render a kind it was never built with.
            assertThat(kind.getDefaultTitle()).isNotBlank();
        }

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void idIsScreamingSnakeCase(FailureKind kind) {
            assertThat(kind.getId()).matches("^[A-Z][A-Z0-9_]*$");
        }

        @Test
        void idsAreUnique() {
            Set<String> ids = new HashSet<>();
            for (FailureKind kind : FailureKind.values()) {
                assertThat(ids.add(kind.getId())).as("duplicate id %s", kind.getId()).isTrue();
            }
        }

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void everyDeclaredErrorCodeIsARealErrorCode(FailureKind kind) {
            Set<String> known =
                    Arrays.stream(ExceptionUtils.ErrorCode.values())
                            .map(ExceptionUtils.ErrorCode::getCode)
                            .collect(Collectors.toSet());
            assertThat(known).containsAll(kind.getErrorCodes());
        }

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void everyDeclaredActionResolvesToALabelKey(FailureKind kind) {
            // Offers are one ordered list, so a label with no matching action is unrepresentable;
            // all that is left to assert is that each action gets a key.
            for (FailureActionId action : kind.getActions()) {
                assertThat(kind.labelKeyFor(action)).startsWith("portal.failures.action.");
            }
        }

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void everyOfferSaysWhoItIsForAndWhereItGoes(FailureKind kind) {
            // Both decide what a caller is shown, so a missing one places a button by accident.
            for (FailureKind.OfferedAction offer : kind.getOfferedActions()) {
                assertThat(offer.audience())
                        .as("%s offers %s", kind.getId(), offer.id())
                        .isNotNull();
                assertThat(offer.slot()).as("%s offers %s", kind.getId(), offer.id()).isNotNull();
            }
        }

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void offersEachActionAtMostOnce(FailureKind kind) {
            // The same action twice would be two buttons with one meaning, and labelKeyFor would
            // answer for the first.
            assertThat(kind.getActions()).doesNotHaveDuplicates();
        }

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void declaresAtMostOneResolution(FailureKind kind) {
            // Two things that both claim to fix it is a sign of two kinds wearing one id.
            assertThat(
                            kind.getOfferedActions().stream()
                                    .filter(offer -> offer.slot() == FailureActionSlot.RESOLUTION)
                                    .toList())
                    .hasSizeLessThanOrEqualTo(1);
        }

        @Test
        void noTwoKindsClaimTheSameErrorCode() {
            // Computed independently of duplicateErrorCodes(), then checked against it: the boot
            // guard reads that method, so a version of it that always returned empty would leave
            // the guard decorative and every other test still passing.
            assertThat(FailureKind.duplicateErrorCodes()).isEmpty();

            Set<String> claimed = new HashSet<>();
            Stream.of(FailureKind.values())
                    .flatMap(kind -> kind.getErrorCodes().stream())
                    .forEach(
                            code ->
                                    assertThat(claimed.add(code))
                                            .as("error code %s claimed twice", code)
                                            .isTrue());
        }
    }

    @Nested
    @DisplayName("every derived key resolves to English copy")
    class Copy {

        /**
         * The enum builds its i18n keys from the constant name, so renaming a kind or shipping a
         * new one sends keys the client has no copy for, and the UI renders the raw key. Nothing
         * else checks that: the portal reads these keys at runtime, and the unused-translation
         * audit only looks the other way, for copy no source file mentions.
         */
        private static final Set<String> KEYS = englishKeys();

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void titleAndDescriptionAreTranslated(FailureKind kind) {
            assertThat(KEYS).contains(kind.getTitleKey(), kind.getDescriptionKey());
        }

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void everyOfferedActionIsLabelled(FailureKind kind) {
            for (FailureActionId action : kind.getActions()) {
                assertThat(KEYS)
                        .as("%s offers %s, but nothing labels it", kind.getId(), action)
                        .contains(kind.labelKeyFor(action));
            }
        }

        /**
         * Every dotted key in the English file, as {@code [section]} plus the name before {@code
         * =}.
         */
        private static Set<String> englishKeys() {
            Set<String> keys = new HashSet<>();
            String section = "";
            for (String raw : readTranslations()) {
                String line = raw.strip();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                if (line.startsWith("[") && line.endsWith("]")) {
                    section = line.substring(1, line.length() - 1).strip() + ".";
                    continue;
                }
                int equals = line.indexOf('=');
                if (equals > 0) {
                    keys.add(section + line.substring(0, equals).strip());
                }
            }
            return keys;
        }

        private static List<String> readTranslations() {
            try {
                return Files.readAllLines(
                        repoFile("frontend/editor/public/locales/en-US/translation.toml"),
                        StandardCharsets.UTF_8);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }

    @Nested
    @DisplayName("UNKNOWN is the catch-all")
    class Unknown {

        @Test
        void offersARetryToItsOwnerAndTheRunToWhoeverReviews() {
            // No known fix, so no resolution; a retry is still worth offering for a one-off.
            assertThat(FailureKind.UNKNOWN.getOfferedActions())
                    .containsExactly(
                            offered(FailureActionId.OPEN_IN_TOOL, OWNER, SECONDARY, "openInTool"),
                            offered(FailureActionId.VIEW_FILE, OWNER, SECONDARY, "viewFile"),
                            offered(
                                    FailureActionId.VIEW_IN_PROCESSOR,
                                    TEAM_REVIEWER,
                                    OVERFLOW,
                                    "viewInProcessor"),
                            offered(FailureActionId.DISMISS, ANYONE_WHO_SEES, OVERFLOW, "dismiss"));
        }

        @Test
        void claimsNoErrorCodeSoItNeverWinsALookup() {
            assertThat(FailureKind.UNKNOWN.getErrorCodes()).isEmpty();
        }
    }

    @Nested
    @DisplayName("lookup")
    class Lookup {

        @Test
        void byIdRoundTripsEveryKind() {
            for (FailureKind kind : FailureKind.values()) {
                assertThat(FailureKind.byId(kind.getId())).contains(kind);
            }
        }

        @Test
        void byIdIsEmptyForAnUnknownId() {
            // Ids arrive from persisted rows and from clients, so this must not throw.
            assertThat(FailureKind.byId("NO_SUCH_KIND")).isEmpty();
            assertThat(FailureKind.byId(null)).isEmpty();
            assertThat(FailureKind.byId("  ")).isEmpty();
        }

        @Test
        void byErrorCodeResolvesTheClaimingKind() {
            assertThat(FailureKind.byErrorCode("E004"))
                    .contains(FailureKind.INPUT_PASSWORD_PROTECTED);
            assertThat(FailureKind.byErrorCode("E001")).contains(FailureKind.INPUT_CORRUPTED);
            assertThat(FailureKind.byErrorCode("E002")).contains(FailureKind.INPUT_CORRUPTED);
        }

        @Test
        void aBrokenEncryptionIsNotAMissingPassword() {
            // E003 is reached only once the key was accepted, so no password would help.
            assertThat(FailureKind.byErrorCode("E003")).contains(FailureKind.INPUT_CORRUPTED);
            assertThat(FailureKind.INPUT_CORRUPTED.declares(FailureActionId.DECRYPT)).isFalse();
        }

        @Test
        void everyCodeAKindClaimsMatchesTheSharedFixture() {
            // The bell mirrors these in KIND_ERROR_CODES (notificationRetry.ts) to tell one file's
            // stashed failure from another's, and a Java test cannot read a TypeScript file. Both
            // sides assert against testing/failure-kind-codes.json instead, so a code added to one
            // and not the other fails on whichever side was not updated.
            assertThat(claimedErrorCodes()).isEqualTo(sharedFixtureCodes());
        }

        /** Kinds claiming nothing are left out, matching what the fixture records. */
        private static Map<String, List<String>> claimedErrorCodes() {
            return Stream.of(FailureKind.values())
                    .filter(kind -> !kind.getErrorCodes().isEmpty())
                    .collect(
                            Collectors.toMap(
                                    FailureKind::getId,
                                    FailureKind::getErrorCodes,
                                    (first, second) -> first,
                                    LinkedHashMap::new));
        }

        private static Map<String, List<String>> sharedFixtureCodes() {
            JsonNode kinds;
            try {
                kinds =
                        JsonMapper.builder()
                                .build()
                                .readTree(repoFile("testing/failure-kind-codes.json").toFile())
                                .get("kinds");
            } catch (JacksonException e) {
                throw new IllegalStateException("testing/failure-kind-codes.json is not JSON", e);
            }

            Map<String, List<String>> codes = new LinkedHashMap<>();
            kinds.propertyStream()
                    .forEach(
                            entry ->
                                    codes.put(
                                            entry.getKey(),
                                            entry.getValue()
                                                    .valueStream()
                                                    .map(JsonNode::asString)
                                                    .toList()));
            return codes;
        }

        @Test
        void byErrorCodeIsEmptyForACodeNoKindHasAdoptedYet() {
            // E031 is FILE_PROCESSING, the catch-all a step throws when it has nothing more
            // specific to say. It stays unclaimed on purpose: UNKNOWN describes it accurately and
            // leads with a retry, which is the right offer for a failure nobody can characterise.
            assertThat(FailureKind.byErrorCode("E031")).isEmpty();
            assertThat(FailureKind.byErrorCode(null)).isEmpty();
        }

        @Test
        void aCodeARetryCouldClearIsLeftToUnknown() {
            // E051 is the bucket analyzeGhostscriptOutput falls back to for output it cannot
            // recognise, so it also carries killed processes and full disks; E053 is an outright
            // interruption. Claiming either would tell an owner a rerunnable failure is permanent.
            assertThat(FailureKind.byErrorCode("E051")).isEmpty();
            assertThat(FailureKind.byErrorCode("E053")).isEmpty();
        }
    }

    @Nested
    @DisplayName("action declaration and labels")
    class Actions {

        @Test
        void declaresOnlyWhatItLists() {
            assertThat(FailureKind.UNKNOWN.declares(FailureActionId.DISMISS)).isTrue();
            assertThat(FailureKind.UNKNOWN.declares(FailureActionId.ACKNOWLEDGE)).isFalse();
        }

        @Test
        void aKindWithSomethingToFixOffersTheFixToItsOwnerAndTheRunToItsReviewer() {
            // Only the owner has the password, so a reviewer is offered the run and a dismiss.
            assertThat(FailureKind.INPUT_PASSWORD_PROTECTED.getOfferedActions())
                    .containsExactly(
                            offered(FailureActionId.DECRYPT, OWNER, RESOLUTION, "decrypt"),
                            offered(FailureActionId.VIEW_FILE, OWNER, SECONDARY, "viewFile"),
                            offered(
                                    FailureActionId.VIEW_IN_PROCESSOR,
                                    TEAM_REVIEWER,
                                    OVERFLOW,
                                    "viewInProcessor"),
                            offered(FailureActionId.OPEN_IN_TOOL, OWNER, OVERFLOW, "openInTool"),
                            offered(FailureActionId.DISMISS, ANYONE_WHO_SEES, OVERFLOW, "dismiss"));
        }

        @Test
        void aRepairableKindNeverPromotesOpenInToolOverTheRepair() {
            assertThat(FailureKind.INPUT_CORRUPTED.getOfferedActions())
                    .contains(offered(FailureActionId.REPAIR, OWNER, RESOLUTION, "repair"))
                    .contains(offered(FailureActionId.OPEN_IN_TOOL, OWNER, OVERFLOW, "openInTool"));
        }

        @Test
        void aKindWithNothingToOfferDeclaresNoResolutionRatherThanAWeakOne() {
            // Zero resolutions is legal, so nothing else would notice one of these quietly
            // gaining a button. Each is here because no action the client can run would change
            // the outcome: the file is the wrong type, empty, gone, or the server is missing a
            // binary. A retry belongs to UNKNOWN, which says plainly that we do not know.
            assertThat(
                            Stream.of(FailureKind.values())
                                    .filter(
                                            kind ->
                                                    kind.getOfferedActions().stream()
                                                            .noneMatch(
                                                                    offer ->
                                                                            offer.slot()
                                                                                    == RESOLUTION))
                                    .toList())
                    .containsExactlyInAnyOrder(
                            FailureKind.COMPLIANCE_NOT_MET,
                            FailureKind.INPUT_WRONG_TYPE,
                            FailureKind.INPUT_UNREADABLE,
                            FailureKind.INPUT_EMPTY,
                            FailureKind.INPUT_UNAVAILABLE,
                            FailureKind.TOOL_NOT_INSTALLED,
                            FailureKind.STEP_CANNOT_RENDER_PAGE,
                            FailureKind.UNKNOWN);
        }

        @Test
        void aMissingDocumentOffersNothingThatWouldOpenIt() {
            assertThat(FailureKind.INPUT_UNAVAILABLE.getOfferedActions())
                    .containsExactly(
                            offered(
                                    FailureActionId.VIEW_IN_PROCESSOR,
                                    TEAM_REVIEWER,
                                    OVERFLOW,
                                    "viewInProcessor"),
                            offered(FailureActionId.DISMISS, ANYONE_WHO_SEES, OVERFLOW, "dismiss"));
        }

        @Test
        void aMissingBinaryIsARunnersProblemNotTheOwners() {
            // No owner-facing offer at all: the document is fine and a retry fails identically
            // until someone installs the binary, so the only useful reader is whoever triages.
            assertThat(FailureKind.TOOL_NOT_INSTALLED.getOfferedActions())
                    .containsExactly(
                            offered(
                                    FailureActionId.VIEW_IN_PROCESSOR,
                                    TEAM_REVIEWER,
                                    SECONDARY,
                                    "viewInProcessor"),
                            offered(FailureActionId.DISMISS, ANYONE_WHO_SEES, OVERFLOW, "dismiss"));
        }

        @Test
        void noKindOffersAcknowledgeAnyMore() {
            // Kept in the vocabulary for rows already ACKNOWLEDGED; offered by nothing, so
            // dispatchable by nothing.
            for (FailureKind kind : FailureKind.values()) {
                assertThat(kind.declares(FailureActionId.ACKNOWLEDGE))
                        .as("%s offers ACKNOWLEDGE", kind.getId())
                        .isFalse();
            }
        }

        @Test
        void everyKindLabelsItsActionsWithTheSharedWordingToday() {
            // The per-kind override still exists for wording that reads badly in context.
            for (FailureKind kind : FailureKind.values()) {
                for (FailureActionId action : kind.getActions()) {
                    assertThat(kind.labelKeyFor(action))
                            .isEqualTo(FailureKind.genericLabelKey(action));
                }
            }
        }

        @Test
        void genericLabelIsDerivedFromTheActionId() {
            assertThat(FailureKind.UNKNOWN.labelKeyFor(FailureActionId.DISMISS))
                    .isEqualTo(FailureKind.genericLabelKey(FailureActionId.DISMISS))
                    .isEqualTo("portal.failures.action.dismiss");
            assertThat(FailureKind.INPUT_PASSWORD_PROTECTED.labelKeyFor(FailureActionId.DECRYPT))
                    .isEqualTo("portal.failures.action.decrypt");
        }

        @Test
        void copyKeysAreDerivedFromTheIdInLowerCamel() {
            assertThat(FailureKind.INPUT_PASSWORD_PROTECTED.getTitleKey())
                    .isEqualTo("portal.failures.kind.inputPasswordProtected.title");
            assertThat(FailureKind.INPUT_PASSWORD_PROTECTED.getDescriptionKey())
                    .isEqualTo("portal.failures.kind.inputPasswordProtected.description");
        }
    }
}
