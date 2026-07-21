package stirling.software.saas.payg.lineage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class LineageSignatureTest {

    @Test
    void storageKey_isTypeAndValueColonJoined() {
        LineageSignature sig = new LineageSignature("sha256", "abc123");

        assertThat(sig.asStorageKey()).isEqualTo("sha256:abc123");
    }

    @Test
    void fromStorageKey_roundTrips() {
        LineageSignature original = new LineageSignature("pdf-id", "deadbeef-cafe-1234");

        LineageSignature parsed = LineageSignature.fromStorageKey(original.asStorageKey());

        assertThat(parsed).isEqualTo(original);
    }

    @Test
    void typeContainingColon_isRejected() {
        // Otherwise the storage-key parse would be ambiguous.
        assertThatThrownBy(() -> new LineageSignature("foo:bar", "value"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void valueCanContainColon() {
        // Values are free-form because they're whatever the extractor produces. The parser only
        // splits on the FIRST colon, so colons in the value are preserved.
        LineageSignature sig = new LineageSignature("custom", "a:b:c");

        LineageSignature parsed = LineageSignature.fromStorageKey(sig.asStorageKey());

        assertThat(parsed.value()).isEqualTo("a:b:c");
    }

    @Test
    void blankType_isRejected() {
        assertThatThrownBy(() -> new LineageSignature("", "value"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void blankValue_isRejected() {
        assertThatThrownBy(() -> new LineageSignature("sha256", ""))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void malformedStorageKey_isRejected() {
        assertThatThrownBy(() -> LineageSignature.fromStorageKey("nocolon"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> LineageSignature.fromStorageKey(":nothingbefore"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> LineageSignature.fromStorageKey("nothingafter:"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
