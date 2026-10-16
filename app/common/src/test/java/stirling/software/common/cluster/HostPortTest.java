package stirling.software.common.cluster;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("HostPort.parse()")
class HostPortTest {

    private static final String PROP = "cluster.valkey.nodes";
    private static final String EXAMPLE = "valkey-1:6379";

    @Test
    @DisplayName("host:port splits into host and port")
    void hostAndPort() {
        HostPort e = HostPort.parse("valkey-1:6379", PROP, EXAMPLE);
        assertEquals("valkey-1", e.host());
        assertEquals(6379, e.port());
    }

    @Test
    @DisplayName("surrounding whitespace is trimmed (comma-separated env vars keep spaces)")
    void trimsWhitespace() {
        HostPort e = HostPort.parse("  valkey-2:6380  ", PROP, EXAMPLE);
        assertEquals("valkey-2", e.host());
        assertEquals(6380, e.port());
    }

    @Test
    @DisplayName("a bracketed IPv6 literal keeps no brackets in the host")
    void bracketedIpv6() {
        HostPort e = HostPort.parse("[::1]:6379", PROP, EXAMPLE);
        assertEquals("::1", e.host());
        assertEquals(6379, e.port());
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "valkey-1:abc",
                "valkey-1:0",
                "valkey-1:70000",
                "valkey-1:",
                ":6379",
                "[::1",
                "[::1]",
                "[::1]6379"
            })
    @DisplayName("a bad port, a missing host or a malformed bracket throws")
    void badEntriesThrow(String entry) {
        assertRejected(entry);
    }

    @Test
    @DisplayName("a bare host is rejected rather than silently taking a default port")
    void bareHostIsRejected() {
        assertRejected("valkey-1");
    }

    @Test
    @DisplayName("an unbracketed IPv6 literal is rejected, not read as host ':' port")
    void unbracketedIpv6IsRejected() {
        IllegalStateException ex = assertRejected("::1");
        assertTrue(
                ex.getMessage().contains("[::1]:6379"),
                "message must show the bracketed form; got: " + ex.getMessage());
    }

    @Test
    @DisplayName("blank entry throws with a host:port example")
    void blankEntryThrows() {
        IllegalStateException ex =
                assertThrows(
                        IllegalStateException.class, () -> HostPort.parse("  ", PROP, EXAMPLE));
        assertTrue(ex.getMessage().contains(PROP));
        assertTrue(ex.getMessage().contains("host:port"));
    }

    private IllegalStateException assertRejected(String entry) {
        IllegalStateException ex =
                assertThrows(
                        IllegalStateException.class, () -> HostPort.parse(entry, PROP, EXAMPLE));
        assertTrue(
                ex.getMessage().contains(PROP),
                "message must name the property; got: " + ex.getMessage());
        assertTrue(
                ex.getMessage().contains(entry),
                "message must echo the offending entry; got: " + ex.getMessage());
        return ex;
    }
}
