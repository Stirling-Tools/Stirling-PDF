package fixtures;

class Narration {

    void export(Document document) {
        // Step 1: collect the annotations
        var annotations = document.annotations();

        // Then, flatten them onto the page
        document.flatten(annotations);

        // IMPORTANT: do not reorder these
        document.save();

        // No longer needed after the storage migration
        legacyCleanup();

        // Ordering matters: flatten() reads the annotation list that save()
        // clears, so a save first loses every annotation. See #6865.
        document.close();
    }
}
