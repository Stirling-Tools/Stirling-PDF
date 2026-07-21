package stirling.software.proprietary.classification.model;

/**
 * One entry in the classification vocabulary. {@code id} is the label's stable identity (a slug,
 * unique within a set): it is what the engine returns and what is stored on the document. {@code
 * name} is the human display text the classifier model reasons over. {@code icon} is an optional
 * presentational key (a Material Symbols name shown in the file sidebar); the engine never sees it.
 */
public record ClassificationLabel(String id, String name, String icon) {}
