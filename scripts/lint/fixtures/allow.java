package fixtures;

class Allow {

    void keptOnPurpose() {
        // comment-lint-allow: CMT002
        // ---------- kept on purpose, this fixture proves the escape hatch ----------
        run();
    }

    void unknownToken(Session session) {
        // comment-lint-allow: FAKE_RULE
        session.close();
    }

    void looksLikeARuleButIsNot(Session session) {
        // comment-lint-allow: CMT999
        session.close();
    }

    void allowedButNothingFires(Session session) {
        // comment-lint-allow: CMT001
        // Closed once the signing round trip has settled, not before.
        session.close();
    }

    void directiveMustNotHideOtherRules(Registry registry) {
        // comment-lint-allow: CMT002
        // Clear the registry
        registry.clear();
    }
}
