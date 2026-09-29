package stirling.software.saas.procurement.model;

/**
 * Buyer / AP details captured on the quote's "Your details" step: the company and signatory
 * contact, a billing address, and a PO number / tax id for the invoice. These are not pricing
 * inputs (they never touch {@link stirling.software.saas.procurement.pricing.QuoteConfig}); they
 * ride alongside the priced config so the quote can be re-seeded on an edit and the fields can flow
 * onto the Stripe customer and invoice. All fields are optional. Country and currency are out of
 * scope for now.
 */
public record QuoteDetails(
        String businessName,
        String contactName,
        String contactEmail,
        String addressLine1,
        String addressLine2,
        String city,
        String region,
        String postalCode,
        String poNumber,
        String taxId) {}
