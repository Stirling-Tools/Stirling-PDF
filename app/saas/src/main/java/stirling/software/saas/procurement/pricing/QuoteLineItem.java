package stirling.software.saas.procurement.pricing;

/**
 * One line on the itemised quote. {@code amountMinor} is in the currency's minor unit (cents);
 * discounts are negative. {@code kind} drives how the portal groups it (recurring annual vs a
 * one-time fee vs a discount line).
 */
public record QuoteLineItem(String key, String label, Kind kind, long amountMinor) {

    public enum Kind {
        RECURRING,
        ONE_TIME,
        DISCOUNT,
        INCLUDED
    }
}
