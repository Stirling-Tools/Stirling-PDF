package stirling.software.proprietary.classification.model;

/**
 * One entry in the classification vocabulary. {@code name} is the label's identity (unique
 * case-insensitively within a set) and the exact string the classifier may assign. {@code icon} is
 * an optional presentational key (a Material Symbols name shown in the file sidebar); the engine
 * never sees it.
 */
public record ClassificationLabel(String name, String icon) {}
