package stirling.software.proprietary.failure;

import java.util.Map;

/**
 * The behaviour behind one {@link FailureActionId}. Implementations are Spring beans injected as a
 * {@code List} and resolved by id, the pattern already used for {@code InputSource}, {@code
 * PolicyOutputSink} and {@code PolicyTrigger}.
 *
 * <p>Keeping behaviour out of the registry keeps that pure data, so a new kind ships by declaring
 * an action id that already has a handler.
 */
public interface FailureAction {

    FailureActionId id();

    /**
     * Apply the action and return the updated event. {@code inputs} carries whatever the action
     * declared it needs, which is nothing for the two that exist today. Implementations leave the
     * document, ledger, run and output destinations alone unless that is the action's purpose.
     */
    FileRunEvent execute(FileRunEvent event, Map<String, String> inputs, String actor);
}
