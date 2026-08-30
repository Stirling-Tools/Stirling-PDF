package fixtures;

class Strings {

    // A `//` inside a literal is not a comment, and neither is an escaped quote.
    void urls() {
        String docs = "https://example.com/guide";
        String quoted = "a \" then // not a comment";
        char slash = '/';
    }
}
