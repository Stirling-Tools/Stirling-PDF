package stirling.software.proprietary.failure;

import java.util.Map;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * The server's half of {@link FailureActionId#DECRYPT}: unlock the document in place, then re-run.
 * The password is used once, over loopback, and never written to the row, the ledger or the log.
 */
@Component
@RequiredArgsConstructor
public class DecryptAction implements FailureAction {

    private static final String REMOVE_PASSWORD_ENDPOINT = "/api/v1/security/remove-password";

    static final String PASSWORD_INPUT = "password";

    private final FolderDocumentFix fix;

    @Override
    public FailureActionId id() {
        return FailureActionId.DECRYPT;
    }

    @Override
    public FileRunEvent execute(FileRunEvent event, Map<String, String> inputs, String actor) {
        String password = inputs.get(PASSWORD_INPUT);
        if (password == null || password.isEmpty()) {
            throw new FailureActionException(
                    FailureActionException.Reason.FIX_FAILED,
                    "This document needs its password to be unlocked.");
        }
        return fix.fixAndRerun(
                event,
                actor,
                REMOVE_PASSWORD_ENDPOINT,
                Map.of(PASSWORD_INPUT, password),
                "That password did not open this document.");
    }
}
