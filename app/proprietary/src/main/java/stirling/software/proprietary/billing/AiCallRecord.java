package stirling.software.proprietary.billing;

import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

/**
 * Where a request's AI work actually ran, set by the engine client and read by the meter. Records
 * the call made rather than the configured mode, which an admin can change mid-request.
 */
public final class AiCallRecord {

    private static final String ATTR = AiCallRecord.class.getName() + ".where";

    private AiCallRecord() {}

    /** Where the engine call went; absent when no call was made. */
    public enum Where {
        /** This server's own engine, so only the local meter bills it. */
        LOCAL,
        /** Stirling Cloud, which bills it on success. */
        REMOTE
    }

    /** No-op off the request thread, so engine calls made on an executor go unrecorded. */
    public static void record(Where where) {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes != null) {
            attributes.setAttribute(ATTR, where, RequestAttributes.SCOPE_REQUEST);
        }
    }

    public static boolean ranLocally(Object attributeValue) {
        return attributeValue == Where.LOCAL;
    }

    public static String attributeName() {
        return ATTR;
    }
}
