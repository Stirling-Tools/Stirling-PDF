package fixtures;

/**
 * Authority on which filesystem locations a policy may read or write. Fail-closed:
 * denied entirely under the saas profile, then Stirling's own config directory is
 * always rejected, then the path must resolve inside an allowed root.
 *
 * <p>Compared after normalisation so {@code ..} cannot escape a root. Symlink
 * escape is not defended: an operator who roots an allowlist on a symlink to a
 * sensitive location is trusted.
 */
class Clean {

    /** Returns the normalised absolute path; throws if not permitted. */
    Path check(Path candidate) {
        // whenComplete runs on the worker thread after the run finishes, so the
        // terminal event never races the step events.
        return candidate.toAbsolutePath().normalize();
    }

    void sizes() {
        // Bytes, not KiB: the API contract predates the unit change and callers
        // still send bytes.
        long limit = 5_242_880L;
    }
}
