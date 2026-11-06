package stirling.software.proprietary.policy.microsoft;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Random;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class QuickXorHashTest {

    @ParameterizedTest
    @CsvSource({
        "'', AAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "Sg==, SgAAAAAAAAAAAAAAAQAAAAAAAAA=",
        "tbQ=, taAFAAAAAAAAAAAAAgAAAAAAAAA="
    })
    void matchesPublishedVectors(String contentBase64, String expected) {
        assertEquals(expected, hash(Base64.getDecoder().decode(contentBase64)));
    }

    @Test
    void isIndependentOfHowTheStreamIsChunked() {
        byte[] content = new byte[100_003];
        new Random(42).nextBytes(content);
        String whole = hash(content);

        QuickXorHash chunked = new QuickXorHash();
        int offset = 0;
        int[] sizes = {1, 7, 159, 160, 161, 4096, 65_536};
        for (int i = 0; offset < content.length; i++) {
            int size = Math.min(sizes[i % sizes.length], content.length - offset);
            chunked.update(content, offset, size);
            offset += size;
        }
        assertEquals(whole, chunked.digestBase64());
    }

    @Test
    void differsWhenContentDiffers() {
        String a = hash("a".repeat(500).getBytes(StandardCharsets.UTF_8));
        String b = hash(("a".repeat(499) + "b").getBytes(StandardCharsets.UTF_8));
        assertNotEquals(a, b);
    }

    private static String hash(byte[] content) {
        QuickXorHash hash = new QuickXorHash();
        hash.update(content, 0, content.length);
        return hash.digestBase64();
    }
}
