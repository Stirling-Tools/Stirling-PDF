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
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import stirling.software.common.util.ExceptionUtils;

/**
 * Tests for {@link FailureKind}. Mostly invariants over the whole enum rather than assertions about
 * individual members, so a kind added later cannot be malformed in a way that only shows up as a
 * button that fails at runtime.
 */
class FailureKindTest {

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
            // Located by walking up, so the test does not depend on the directory Gradle runs it
            // in.
            Path relative = Path.of("frontend/editor/public/locales/en-US/translation.toml");
            for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
                Path candidate = dir.resolve(relative);
                if (Files.isRegularFile(candidate)) {
                    try {
                        return Files.readAllLines(candidate, StandardCharsets.UTF_8);
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                }
            }
            throw new IllegalStateException(
                    "No " + relative + " above " + Path.of("").toAbsolutePath());
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
                            offered(FailureActionId.RETRY, OWNER, SECONDARY, "retry"),
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
        }

        @Test
        void byErrorCodeIsEmptyForACodeNoKindHasAdoptedYet() {
            // E001 is PDF_CORRUPTED: a real error code, deliberately not yet a kind.
            assertThat(FailureKind.byErrorCode("E001")).isEmpty();
            assertThat(FailureKind.byErrorCode(null)).isEmpty();
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
                            offered(
                                    FailureActionId.DECRYPT_AND_RETRY,
                                    OWNER,
                                    RESOLUTION,
                                    "decryptAndRetry"),
                            offered(FailureActionId.VIEW_FILE, OWNER, SECONDARY, "viewFile"),
                            offered(
                                    FailureActionId.VIEW_IN_PROCESSOR,
                                    TEAM_REVIEWER,
                                    OVERFLOW,
                                    "viewInProcessor"),
                            offered(FailureActionId.RETRY, OWNER, OVERFLOW, "retry"),
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
            assertThat(
                            FailureKind.INPUT_PASSWORD_PROTECTED.labelKeyFor(
                                    FailureActionId.DECRYPT_AND_RETRY))
                    .isEqualTo("portal.failures.action.decryptAndRetry");
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
