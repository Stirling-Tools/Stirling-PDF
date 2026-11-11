package fixtures;

class Apostrophes {

    /** The approver's team, which must match the one this server already belongs to. */
    Long teamId;

    // The caller's own retry budget applies here; this method does not retry.
    void submit() {}

    void literals() {
        char quote = '\'';
        char newline = '\n';
        char slash = '/';
        String path = "a//b";
    }

    /** Kept last: if the scanner desynchronises above, this stops being seen. */
    void canary() {
        // Build document
        document = build();
    }
}
