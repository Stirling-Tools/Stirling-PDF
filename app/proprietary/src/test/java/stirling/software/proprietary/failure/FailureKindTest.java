package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
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
                            .collect(java.util.stream.Collectors.toSet());
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

        @Test
        void noTwoKindsClaimTheSameErrorCode() {
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
    @DisplayName("UNKNOWN is the catch-all")
    class Unknown {

        @Test
        void existsAndCanBeTriaged() {
            assertThat(FailureKind.UNKNOWN.getActions())
                    .containsExactlyInAnyOrder(
                            FailureActionId.ACKNOWLEDGE, FailureActionId.DISMISS);
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
            assertThat(FailureKind.UNKNOWN.declares(FailureActionId.ACKNOWLEDGE)).isTrue();
            assertThat(FailureKind.UNKNOWN.declares(FailureActionId.DISMISS)).isTrue();
        }

        @Test
        void overriddenLabelWinsOverTheGenericOne() {
            String label =
                    FailureKind.INPUT_PASSWORD_PROTECTED.labelKeyFor(FailureActionId.DISMISS);
            assertThat(label).isEqualTo("portal.failures.action.dismissSkipFile");
            assertThat(label).isNotEqualTo(FailureKind.genericLabelKey(FailureActionId.DISMISS));
        }

        @Test
        void genericLabelIsUsedWhenAKindDeclaresNoOverride() {
            assertThat(FailureKind.UNKNOWN.labelKeyFor(FailureActionId.DISMISS))
                    .isEqualTo(FailureKind.genericLabelKey(FailureActionId.DISMISS))
                    .isEqualTo("portal.failures.action.dismiss");
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
