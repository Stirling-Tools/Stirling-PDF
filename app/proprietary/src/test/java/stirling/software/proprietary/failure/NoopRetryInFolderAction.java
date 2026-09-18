package stirling.software.proprietary.failure;

import java.util.Map;

/**
 * Satisfies the registry's "every declared action has a handler" check for tests that are about
 * something else. The real handler needs a policy store, a ledger and a runner, none of which these
 * tests have or exercise; {@code RetryInFolderActionTest} covers it properly.
 */
final class NoopRetryInFolderAction implements FailureAction {

    @Override
    public FailureActionId id() {
        return FailureActionId.RETRY_IN_FOLDER;
    }

    @Override
    public FileRunEvent execute(FileRunEvent event, Map<String, String> inputs, String actor) {
        throw new UnsupportedOperationException("not the subject of this test");
    }
}
