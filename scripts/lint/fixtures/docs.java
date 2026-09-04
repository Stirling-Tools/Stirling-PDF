package fixtures;

class Docs {

    /**
     * @param blob the blob
     * @param timeoutMs how long to wait before abandoning the read; the caller
     *     owns retrying, because only it knows whether the operation is
     *     idempotent
     */
    void download(Blob blob, long timeoutMs) {}
}
