package stirling.software.proprietary.security.util;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

class Base32CodecTest {

    @Test
    void encodeReturnsEmptyStringForEmptyInput() {
        assertEquals("", Base32Codec.encode(new byte[0]));
        assertEquals("", Base32Codec.encode(null));
    }

    @Test
    void decodeReturnsEmptyArrayForBlankInput() {
        assertArrayEquals(new byte[0], Base32Codec.decode(null));
        assertArrayEquals(new byte[0], Base32Codec.decode(""));
        assertArrayEquals(new byte[0], Base32Codec.decode("   "));
    }

    @Test
    void encodeDecodeRoundTrip() {
        byte[] input = "hello world".getBytes(StandardCharsets.UTF_8);
        String encoded = Base32Codec.encode(input);
        byte[] decoded = Base32Codec.decode(encoded);

        assertArrayEquals(input, decoded);
    }

    @Test
    void decodeAcceptsPaddingSpacesAndLowercase() {
        byte[] decoded = Base32Codec.decode("mzxw6y tboi====");
        assertEquals("foobar", new String(decoded, StandardCharsets.UTF_8));
    }

    @Test
    void decodeRejectsInvalidCharacters() {
        assertThrows(IllegalArgumentException.class, () -> Base32Codec.decode("MZXW6$"));
    }
}
