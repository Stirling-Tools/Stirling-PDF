package stirling.software.proprietary.billing;

import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

/**
 * Where a request's AI work actually ran, recorded by the engine client and read by the meter.
 *
 * <p>The two live in different layers and never share a call frame: the client holds the engine's
 * {@code java.net.http.HttpResponse}, the meter holds the servlet response going back to the
 * browser. A request attribute is the only thing that spans them, which is the same reason the
 * interceptor already carries its category and gate reason this way.
 *
 * <p>Recording what happened rather than reading configuration afterwards is the point. Mode is
 * live-editable, so an admin saving settings mid-request could otherwise make the meter disagree
 * with the call that was actually made - and a route that returns successfully without calling the
 * engine at all would be charged for work nobody did.
 */
public final class AiCallRecord {

    private static final String ATTR = AiCallRecord.class.getName() + ".where";

    private AiCallRecord() {}

    /** Where the engine call went. Absent entirely when no call was made. */
    public enum Where {
        /** This server's own engine. Nobody else billed it, so the local meter must. */
        LOCAL,
        /** Stirling Cloud, which bills on success. Metering here too would charge twice. */
        REMOTE
    }

    /** No-op off the request thread, which is why streaming callers must not rely on this. */
    public static void record(Where where) {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes != null) {
            attributes.setAttribute(ATTR, where, RequestAttributes.SCOPE_REQUEST);
        }
    }

    /**
     * @return true only when this server's own engine did the work, so no one else has billed it
     */
    public static boolean ranLocally(Object attributeValue) {
        return attributeValue == Where.LOCAL;
    }

    public static String attributeName() {
        return ATTR;
    }
}
