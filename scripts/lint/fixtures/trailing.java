package fixtures;

class Trailing {

    void decodings() {
        byte[] header = {0x25, 0x50, 0x44, 0x46}; // "%PDF"
        long maxSize = 50L * 1024 * 1024; // 50 MB
        double buffer = 0.10; // 10% headroom
        int mode = 2; // MB
    }

    void stillJudged() {
        boolean supportsSign = false; // TODO make Sign work
        cleanup(); // this used to run before the flush
    }

    void blockFormToo() {
        int mode = 2; /* MB */
        boolean ready = false; /* TODO wire this up */
        reset(); /* this used to run before the flush */
    }
}
