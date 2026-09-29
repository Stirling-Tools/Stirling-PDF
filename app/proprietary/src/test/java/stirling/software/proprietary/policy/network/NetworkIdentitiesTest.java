package stirling.software.proprietary.policy.network;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

class NetworkIdentitiesTest {

    private static NetworkConfig config(String protocol, String share) {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("protocol", protocol);
        options.put("host", "files.example.com");
        options.put("port", "2222");
        options.put("username", "u");
        options.put("password", "p");
        if (share != null) {
            options.put("share", share);
        }
        return NetworkConfig.from(options);
    }

    @Test
    void identityIsProtocolHostPortAndPath() {
        assertEquals(
                "sftp://files.example.com:2222/in/doc.pdf",
                NetworkIdentities.identity(config("sftp", null), "in/doc.pdf"));
    }

    @Test
    void smbIdentityIncludesTheShare() {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("protocol", "smb");
        options.put("host", "files.example.com");
        options.put("username", "u");
        options.put("password", "p");
        options.put("share", "documents");
        assertEquals(
                "smb://files.example.com:445/documents/reports/q1.pdf",
                NetworkIdentities.identity(NetworkConfig.from(options), "reports/q1.pdf"));
    }

    @Test
    void gateIsSizeAndModifiedTime() {
        assertEquals("42:1700000000000", NetworkIdentities.gate(42, 1700000000000L));
    }
}
