package stirling.software.proprietary.failure;

import java.util.Map;

/**
 * Satisfies the registry's "every declared action has a handler" check for tests about something
 * else. The real handlers need a store, ledger, runner and API client, and have their own tests.
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
