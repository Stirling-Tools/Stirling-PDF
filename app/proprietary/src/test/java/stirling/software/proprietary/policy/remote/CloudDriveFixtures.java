package stirling.software.proprietary.policy.remote;

import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.List;
import java.util.function.Supplier;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.proprietary.policy.input.ResolveContext;
import stirling.software.proprietary.policy.ledger.InProcessProcessedLedger;
import stirling.software.proprietary.security.model.User;

public final class CloudDriveFixtures {

    private CloudDriveFixtures() {}

    public static ByteArrayResource named(String text, String name) {
        return named(text.getBytes(StandardCharsets.UTF_8), name);
    }

    public static ByteArrayResource named(byte[] content, String name) {
        return new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }

    public static User user(long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        return user;
    }

    public static void signIn(User user) {
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
    }

    public static ResolveContext ledgerContext(InProcessProcessedLedger ledger, String policyId) {
        return new ResolveContext() {
            @Override
            public boolean claim(String identity, String gate, Supplier<String> contentHash) {
                return ledger.claim(policyId, identity, gate, contentHash);
            }

            @Override
            public void settle(String identity, String gate, String hash, boolean success) {
                ledger.settle(policyId, identity, gate, hash, success);
            }

            @Override
            public boolean allSettledDone(String identity) {
                return ledger.allSettledDone(identity);
            }

            @Override
            public void reportPresent(Collection<String> identities) {}
        };
    }
}
