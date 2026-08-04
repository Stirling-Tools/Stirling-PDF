package stirling.software.SPDF.model.domain;

/**
 * Marker interface for all domain objects in the document model. Domain objects represent immutable
 * or mutable elements within a PDF document.
 */
public interface DomainObject {

    /**
     * Returns the unique identifier for this domain object.
     *
     * @return Object ID
     */
    String getId();

    /**
     * Returns the type of this domain object.
     *
     * @return Object type
     */
    DomainObjectType getType();
}
