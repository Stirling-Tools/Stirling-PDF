package stirling.software.SPDF.model.domain;

/** Listener interface for document change events. */
public interface IDocumentChangeListener {

    /**
     * Called when the document structure has changed (pages added/removed).
     *
     * @param document The document that changed
     */
    void onStructureChanged(IDocumentModel document);

    /**
     * Called when content on a page has been modified.
     *
     * @param document The document that changed
     * @param pageIndex The index of the modified page
     */
    void onPageContentChanged(IDocumentModel document, int pageIndex);

    /**
     * Called when document metadata has been updated.
     *
     * @param document The document that changed
     */
    void onMetadataChanged(IDocumentModel document);
}
