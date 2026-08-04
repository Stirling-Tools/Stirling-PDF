package stirling.software.SPDF.model.domain;

import java.util.Map;

/** Represents document metadata. */
public interface IMetadataModel extends DomainObject {

    /**
     * Returns the document title.
     *
     * @return Title or null if not set
     */
    String getTitle();

    /**
     * Returns the document author.
     *
     * @return Author or null if not set
     */
    String getAuthor();

    /**
     * Returns the document subject.
     *
     * @return Subject or null if not set
     */
    String getSubject();

    /**
     * Returns the document keywords.
     *
     * @return Keywords or null if not set
     */
    String getKeywords();

    /**
     * Returns the document creator.
     *
     * @return Creator or null if not set
     */
    String getCreator();

    /**
     * Returns the document producer.
     *
     * @return Producer or null if not set
     */
    String getProducer();

    /**
     * Returns all custom metadata properties.
     *
     * @return Map of custom properties
     */
    Map<String, String> getCustomProperties();
}
