package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
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

    /**
     * One expected offer in full, rather than four separate extracting() assertions, so a
     * declaration that pairs the right action with the wrong audience cannot pass.
     */
    private static FailureKind.OfferedAction offered(
            FailureActionId id, FailureAudience audience, String labelKeySuffix) {
        return new FailureKind.OfferedAction(
                id, "portal.failures.action." + labelKeySuffix, audience);
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

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void declaresItsActionsInTheSameOrderAsEveryOtherKind(FailureKind kind) {
            // Declaration order is display order, and the first offer a reader can use is the one
            // rendered as the row's primary. Two kinds listing the same actions in different orders
            // therefore flip the solid button between rows, which reads as a bug rather than as
            // emphasis. Asserted as a shared ranking so a kind added later cannot reintroduce it.
            List<FailureActionId> ranking =
                    List.of(
                            FailureActionId.VIEW_FILE,
                            FailureActionId.VIEW_IN_PROCESSOR,
                            FailureActionId.DISMISS);

            List<FailureActionId> declared = kind.getActions();
            assertThat(ranking)
                    .as("%s declares an action the shared ranking does not rank", kind.getId())
                    .containsAll(declared);
            assertThat(declared)
                    .as("%s declares its actions out of the shared order", kind.getId())
                    .isEqualTo(ranking.stream().filter(declared::contains).toList());
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
        void everyOfferSaysWhoItIsFor(FailureKind kind) {
            // Read per row to decide what a caller is shown, so a missing one would be a button
            // offered to whoever the null case happened to let through.
            for (FailureKind.OfferedAction offer : kind.getOfferedActions()) {
                assertThat(offer.audience())
                        .as("%s offers %s", kind.getId(), offer.id())
                        .isNotNull();
            }
        }

        @ParameterizedTest
        @EnumSource(FailureKind.class)
        void offersEachActionAtMostOnce(FailureKind kind) {
            // Declaration order is the client's tie-break, so the same action twice would be two
            // buttons with one meaning, and labelKeyFor would silently answer for the first.
            assertThat(kind.getActions()).doesNotHaveDuplicates();
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
        void offersItsOwnerTheirDocumentAndTheRunToWhoeverReviews() {
            // Nothing here is known to be fixable, so the offers are the places to look: the
            // owner their document, a reviewer the run, and anyone may close the row.
            assertThat(FailureKind.UNKNOWN.getOfferedActions())
                    .containsExactly(
                            offered(FailureActionId.VIEW_FILE, OWNER, "viewFile"),
                            offered(
                                    FailureActionId.VIEW_IN_PROCESSOR,
                                    TEAM_REVIEWER,
                                    "viewInProcessor"),
                            offered(FailureActionId.DISMISS, ANYONE_WHO_SEES, "dismiss"));
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
        void offersTheDocumentToItsOwnerAndTheRunToItsReviewer() {
            // The whole point of the audiences: only the owner holds the document, so a reviewer
            // is offered the run and a way to close the row instead.
            assertThat(FailureKind.INPUT_PASSWORD_PROTECTED.getOfferedActions())
                    .containsExactly(
                            offered(FailureActionId.VIEW_FILE, OWNER, "viewFile"),
                            offered(
                                    FailureActionId.VIEW_IN_PROCESSOR,
                                    TEAM_REVIEWER,
                                    "viewInProcessor"),
                            offered(FailureActionId.DISMISS, ANYONE_WHO_SEES, "dismiss"));
        }

        @Test
        void noKindOffersAcknowledgeAnyMore() {
            // Kept in the vocabulary because rows are already ACKNOWLEDGED, and those must stay
            // readable. Nothing offers it, so nothing can dispatch it either.
            for (FailureKind kind : FailureKind.values()) {
                assertThat(kind.declares(FailureActionId.ACKNOWLEDGE))
                        .as("%s offers ACKNOWLEDGE", kind.getId())
                        .isFalse();
            }
        }

        @Test
        void everyKindLabelsItsActionsWithTheSharedWordingToday() {
            // The per-kind override still exists for wording that reads badly in context; nothing
            // needs it now that Dismiss sits in an overflow menu, where the shared word is right.
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
                                    FailureActionId.VIEW_IN_PROCESSOR))
                    .isEqualTo("portal.failures.action.viewInProcessor");
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
