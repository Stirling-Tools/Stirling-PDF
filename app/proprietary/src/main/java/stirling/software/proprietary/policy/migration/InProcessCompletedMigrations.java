package stirling.software.proprietary.policy.migration;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory {@link CompletedMigrations} for tests and any future no-database mode. {@link
 * JpaCompletedMigrations} is the runtime bean.
 */
public class InProcessCompletedMigrations implements CompletedMigrations {

    private final Set<String> done = ConcurrentHashMap.newKeySet();

    @Override
    public boolean isDone(String id) {
        return done.contains(id);
    }

    @Override
    public void markDone(String id) {
        done.add(id);
    }
}
