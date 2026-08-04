package stirling.software.proprietary.policy.source;

import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import stirling.software.proprietary.policy.config.FolderAccessDeniedException;

/**
 * A folder source was rejected for pointing outside the allowed roots. Returns a 400 carrying
 * {@link SourceController#FOLDER_ACCESS_DENIED_CODE} so the portal can offer a link to the Folder
 * Access settings, while other guard rejections (SaaS mode, the protected config dir) fall through
 * to the global handler as plain 400s the admin can't fix by editing the allowlist.
 *
 * <p>Was an {@code @ExceptionHandler} on {@link SourceController}; a JAX-RS mapper is global, which
 * is equivalent here because every other route reaching the folder guard catches {@link
 * IllegalArgumentException} itself and never lets this type escape.
 */
@Provider
public class FolderAccessDeniedExceptionMapper
        implements ExceptionMapper<FolderAccessDeniedException> {

    private static final String PROBLEM_JSON = "application/problem+json";

    @Override
    public Response toResponse(FolderAccessDeniedException ex) {
        // Same body Spring's ProblemDetail serialised (type/title default off the status), with the
        // machine-readable code flattened alongside it as setProperty did.
        Map<String, Object> problem = new LinkedHashMap<>();
        problem.put("type", "about:blank");
        problem.put("title", Response.Status.BAD_REQUEST.getReasonPhrase());
        problem.put("status", Response.Status.BAD_REQUEST.getStatusCode());
        problem.put("detail", ex.getMessage());
        problem.put("code", SourceController.FOLDER_ACCESS_DENIED_CODE);
        return Response.status(Response.Status.BAD_REQUEST)
                .type(PROBLEM_JSON)
                .entity(problem)
                .build();
    }
}
