package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.SecureRandom;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class LinkKeyFormatTest {

    private final SecureRandom random = new SecureRandom();

    @Test
    void generatedKeyRoundTrips() {
        LinkKeyFormat.Parts parts = LinkKeyFormat.generate(random);
        String key = parts.compose();

        assertThat(key).startsWith("stlk_");
        assertThat(LinkKeyFormat.parse(key)).contains(parts);
        assertThat(LinkKeyFormat.looksLikeLinkKey(key)).isTrue();
    }

    @Test
    void ignoresWhitespaceFromWrappedOrEnvFileKeys() {
        String key = LinkKeyFormat.generate(random).compose();
        String wrapped = "  " + key.substring(0, 30) + "\n  " + key.substring(30) + "\r\n";

        assertThat(LinkKeyFormat.parse(wrapped).map(LinkKeyFormat.Parts::compose)).contains(key);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {"", "stlk_", "stlk_short.secret", "1f3c2a9e-0b7d-4c5e-9a12-3b4c5d6e7f80"})
    void rejectsShapesThatAreNotKeys(String raw) {
        assertThat(LinkKeyFormat.parse(raw)).isEmpty();
    }

    @Test
    void rejectsKeysWithTheWrongLengthsCaseOrAlphabet() {
        String id = "A".repeat(22);
        String secret = "B".repeat(43);

        assertThat(LinkKeyFormat.parse("stlk_" + id + "." + secret)).isPresent();
        assertThat(LinkKeyFormat.parse("STLK_" + id + "." + secret)).isEmpty();
        assertThat(LinkKeyFormat.parse("stlk_" + id + "." + secret.substring(1))).isEmpty();
        assertThat(LinkKeyFormat.parse("stlk_" + id + "." + secret + "B")).isEmpty();
        assertThat(LinkKeyFormat.parse("stlk_" + id + "." + secret.substring(1) + "+")).isEmpty();
        assertThat(LinkKeyFormat.parse("stlk_" + id + secret)).isEmpty();
    }

    @Test
    void recognisesAMistypedKeyAsAKeySoItIsNotTreatedAsALicence() {
        assertThat(LinkKeyFormat.looksLikeLinkKey(" stlk_typo")).isTrue();
        assertThat(LinkKeyFormat.looksLikeLinkKey("1f3c2a9e-0b7d-4c5e-9a12-3b4c5d6e7f80"))
                .isFalse();
        assertThat(LinkKeyFormat.looksLikeLinkKey(null)).isFalse();
    }

    @Test
    void toStringNeverShowsTheSecret() {
        LinkKeyFormat.Parts parts = LinkKeyFormat.generate(random);

        assertThat(parts.toString()).contains(parts.keyId()).doesNotContain(parts.secret());
    }
}
