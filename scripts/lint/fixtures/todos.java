package fixtures;

class Todos {

    void bare() {
        // TODO: re-enable once account syncing lands
        skip();
    }

    void referenced() {
        // TODO(#1234): re-enable once account syncing lands
        skip();
    }

    void linked() {
        // FIXME: the upstream fix is tracked at https://example.com/issues/9
        workaround();
    }

    void mentioned() {
        // Image placeholders are not scored: their body text is a TODO marker
        // rather than prose, so scoring it would reward the placeholder.
        score();
    }
}
