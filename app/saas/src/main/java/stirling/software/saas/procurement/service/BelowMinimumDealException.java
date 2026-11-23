package stirling.software.saas.procurement.service;

/**
 * A quote priced under the minimum enterprise deal size. A distinct type so the API can tell the
 * buyer their quote is too small, rather than reporting it like any other conflicting state.
 */
public class BelowMinimumDealException extends IllegalStateException {

    public BelowMinimumDealException(String message) {
        super(message);
    }
}
