package stirling.software.SPDF.model.api.ai;

/**
 * The envelope Java parses after each call to the Python Ledger Auditor.
 *
 * <p>Exactly one of {@code requisition} or {@code verdict} will be non-null:
 *
 * <ul>
 *   <li>If {@code requisition} is set, Java must fulfil it and call Python again.
 *   <li>If {@code verdict} is set, the audit is complete; Java returns it to the client.
 * </ul>
 *
 * @param requisition Non-null when the Auditor needs more evidence from Java.
 * @param verdict Non-null when the Auditor has reached a final opinion.
 */
public record AgentTurn(Requisition requisition, Verdict verdict) {

    public boolean isFinal() {
        return verdict != null;
    }
}
