package stirling.software.proprietary.security.controller;

import java.math.BigInteger;
import java.security.PublicKey;
import java.security.interfaces.RSAPublicKey;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.JwtVerificationKey;
import stirling.software.proprietary.security.service.KeyPersistenceServiceInterface;

@RestController
@RequiredArgsConstructor
public class JwksController {

    private final KeyPersistenceServiceInterface keyPersistenceService;

    @GetMapping(value = "/api/v1/auth/keys", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> getKeys() {
        List<JwtVerificationKey> keys =
                keyPersistenceService.getKeysEligibleForCleanup(LocalDateTime.now().plusYears(50));

        List<Map<String, String>> jwks =
                keys.stream()
                        .map(
                                k -> {
                                    try {
                                        PublicKey pk =
                                                keyPersistenceService.decodePublicKey(
                                                        k.getVerifyingKey());
                                        if (pk instanceof RSAPublicKey rsa) {
                                            return rsaToJwk(k.getKeyId(), rsa);
                                        }
                                    } catch (Exception ignored) {
                                    }
                                    return null;
                                })
                        .filter(Objects::nonNull)
                        .collect(Collectors.toList());

        Map<String, Object> response = new HashMap<>();
        response.put("keys", jwks);
        return response;
    }

    private Map<String, String> rsaToJwk(String kid, RSAPublicKey rsa) {
        Map<String, String> jwk = new HashMap<>();
        jwk.put("kty", "RSA");
        jwk.put("alg", "RS256");
        jwk.put("use", "sig");
        jwk.put("kid", kid);
        jwk.put("n", base64Url(rsa.getModulus()));
        jwk.put("e", base64Url(rsa.getPublicExponent()));
        return jwk;
    }

    private String base64Url(BigInteger value) {
        byte[] bytes = toUnsignedBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private byte[] toUnsignedBytes(BigInteger bi) {
        byte[] bytes = bi.toByteArray();
        if (bytes.length > 1 && bytes[0] == 0) {
            // Remove leading sign byte
            byte[] tmp = new byte[bytes.length - 1];
            System.arraycopy(bytes, 1, tmp, 0, tmp.length);
            return tmp;
        }
        return bytes;
    }
}
