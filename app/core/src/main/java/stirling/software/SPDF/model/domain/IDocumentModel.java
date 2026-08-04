package stirling.software.SPDF.model.domain;

import java.util.List;
import java.util.UUID;

/**
 * Represents the entire PDF document in the domain model. This is the aggregate root that owns all
 * pages and metadata.
 */
public interface IDocumentModel {

    /**
     * Returns the unique identifier for this document.
     *
     * @return Document UUID
     */
    UUID getId();

    /**
     * Returns the name of the document file.
     *
     * @return Document name
     */
    String getName();

    /**
     * Returns the path to the source file, if available.
     *
     * @return File path or null if not saved yet
     */
    String getSourcePath();

    /**
     * Returns the total number of pages in the document.
     *
     * @return Page count
     */
    int getPageCount();

    /**
     * Returns a specific page by index.
     *
     * @param index The 0-based page index
     * @return The page model
     * @throws IndexOutOfBoundsException if index is invalid
     */
    IPageModel getPage(int index);

    /**
     * Returns all pages in the document.
     *
     * @return List of page models
     */
    List<IPageModel> getAllPages();

    /**
     * Returns the document metadata.
     *
     * @return Metadata object
     */
    IMetadataModel getMetadata();

    /**
     * Registers a listener for document changes.
     *
     * @param listener The listener to register
     */
    void addChangeListener(IDocumentChangeListener listener);

    /**
     * Removes a change listener.
     *
     * @param listener The listener to remove
     */
    void removeChangeListener(IDocumentChangeListener listener);
}
