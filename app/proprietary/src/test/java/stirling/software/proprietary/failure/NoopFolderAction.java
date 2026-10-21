package stirling.software.proprietary.failure;

import java.util.Map;

/**
 * Satisfies the registry's "every declared action has a handler" check for tests about something
 * else. The real handler needs a policy store, a ledger and a runner, and has its own tests.
 */
final class NoopFolderAction implements FailureAction {
    private final FailureActionId id;

    NoopFolderAction(FailureActionId id) {
        this.id = id;
    }

    @Override
    public FailureActionId id() {
        return id;
    }

    @Override
    public FileRunEvent execute(FileRunEvent event, Map<String, String> inputs, String actor) {
        throw new UnsupportedOperationException("not the subject of this test");
    }
}
