package stirling.software.proprietary.model.api.ai.contradiction;

/**
 * A single atomic factual claim, recommendation, or position extracted from one PDF page by the
 * Python Contradiction Agent.
 *
 * <p>Java counterpart of the Python {@code Claim} model in {@code contracts/contradiction.py};
 * field names mirror the Python {@code ApiModel} camelCase serialisation.
 *
 * @param page 0-indexed page number where the claim appears.
 * @param text Paraphrased atomic claim.
 * @param subject The entity / topic the claim is about (used for canonicalised bucketing).
 * @param polarity One of the values defined in {@link ClaimPolarity}; rejects unknown values on
 *     deserialisation so a Python-side literal expansion surfaces early instead of silently
 *     drifting through the wire.
 * @param quote Verbatim quote from the page (≤200 chars), used as the comment anchor.
 */
public record Claim(int page, String text, String subject, ClaimPolarity polarity, String quote) {}
