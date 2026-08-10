package stirling.software.proprietary.policy.legacy;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory {@link ImportedPipelines} for tests and any future no-database mode. {@link
 * JpaImportedPipelines} is the runtime bean.
 */
public class InProcessImportedPipelines implements ImportedPipelines {

    private final Set<String> imported = ConcurrentHashMap.newKeySet();

    @Override
    public boolean isImported(String key) {
        return imported.contains(key);
    }

    @Override
    public void markImported(String key) {
        imported.add(key);
    }
}
