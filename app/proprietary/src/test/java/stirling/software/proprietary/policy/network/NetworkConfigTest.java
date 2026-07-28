package stirling.software.proprietary.policy.network;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

class NetworkConfigTest {

    private static Map<String, Object> base(String protocol) {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("protocol", protocol);
        options.put("host", "files.example.com");
        options.put("username", "u");
        options.put("password", "p");
        return options;
    }

    @Test
    void parsesAnSftpConnectionWithDefaultPort() {
        NetworkConfig config = NetworkConfig.from(base("sftp"));
        assertEquals(NetworkProtocol.SFTP, config.protocol());
        assertEquals(22, config.port());
        assertEquals("files.example.com", config.host());
    }

    @Test
    void defaultsPortPerProtocol() {
        assertEquals(21, NetworkConfig.from(base("ftp")).port());
        Map<String, Object> smb = base("smb");
        smb.put("share", "docs");
        assertEquals(445, NetworkConfig.from(smb).port());
    }

    @Test
    void implicitFtpsDefaultsToPort990() {
        Map<String, Object> implicit = base("ftp");
        implicit.put("security", "implicit");
        assertEquals(990, NetworkConfig.from(implicit).port());

        implicit.put("port", "2121");
        assertEquals(2121, NetworkConfig.from(implicit).port());
    }

    @Test
    void sftpAcceptsAPrivateKeyInsteadOfAPassword() {
        Map<String, Object> options = base("sftp");
        options.remove("password");
        options.put("privateKey", "dummy-test-key-material");
        NetworkConfig config = NetworkConfig.from(options);
        assertEquals(NetworkProtocol.SFTP, config.protocol());
    }

    @Test
    void sftpWithoutPasswordOrKeyIsRejected() {
        Map<String, Object> options = base("sftp");
        options.remove("password");
        assertThrows(IllegalArgumentException.class, () -> NetworkConfig.from(options));
    }

    @Test
    void ftpRequiresAPassword() {
        Map<String, Object> options = base("ftp");
        options.remove("password");
        assertThrows(IllegalArgumentException.class, () -> NetworkConfig.from(options));
    }

    @Test
    void smbRequiresAShare() {
        assertThrows(IllegalArgumentException.class, () -> NetworkConfig.from(base("smb")));
    }

    @Test
    void requiresProtocolHostAndUsername() {
        assertThrows(
                IllegalArgumentException.class,
                () -> NetworkConfig.from(Map.of("host", "h", "username", "u", "password", "p")));
        Map<String, Object> noHost = base("sftp");
        noHost.remove("host");
        assertThrows(IllegalArgumentException.class, () -> NetworkConfig.from(noHost));
        Map<String, Object> noUser = base("sftp");
        noUser.remove("username");
        assertThrows(IllegalArgumentException.class, () -> NetworkConfig.from(noUser));
    }

    @Test
    void rejectsAnOutOfRangePort() {
        Map<String, Object> options = base("sftp");
        options.put("port", "70000");
        assertThrows(IllegalArgumentException.class, () -> NetworkConfig.from(options));
    }

    @Test
    void rejectsATraversalDirectory() {
        Map<String, Object> options = base("sftp");
        options.put("directory", "in/../../etc");
        assertThrows(IllegalArgumentException.class, () -> NetworkConfig.from(options));
    }

    @Test
    void mapsModeToSnapshotFlag() {
        Map<String, Object> consume = base("sftp");
        consume.put("mode", "consume");
        assertFalse(NetworkConfig.from(consume).snapshot());

        Map<String, Object> snapshot = base("sftp");
        snapshot.put("mode", "snapshot");
        assertTrue(NetworkConfig.from(snapshot).snapshot());

        Map<String, Object> bad = base("sftp");
        bad.put("mode", "sometimes");
        assertThrows(IllegalArgumentException.class, () -> NetworkConfig.from(bad));
    }

    @Test
    void carriesTheHostKeyFingerprint() {
        Map<String, Object> options = base("sftp");
        options.put("hostKeyFingerprint", " SHA256:abc123 ");
        assertEquals("SHA256:abc123", NetworkConfig.from(options).hostKeyFingerprint());
        assertNull(NetworkConfig.from(base("sftp")).hostKeyFingerprint());
    }

    @Test
    void toStringHidesSecrets() {
        Map<String, Object> options = base("sftp");
        options.put("password", "hunter2");
        String text = NetworkConfig.from(options).toString();
        assertFalse(text.contains("hunter2"), "password must not appear in toString");
    }
}
