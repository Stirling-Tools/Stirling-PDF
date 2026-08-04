package stirling.software.SPDF.config;

import io.vertx.ext.web.Router;
import io.vertx.ext.web.RoutingContext;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

/**
 * Forces the correct {@code Content-Type} for ES-module ({@code .mjs}) and WebAssembly ({@code
 * .wasm}) static assets.
 *
 * <p>Quarkus' static-resource handler maps {@code .js} to {@code application/javascript} but does
 * not recognise the {@code .mjs} extension, so files like the bundled {@code pdf.worker.min-*.mjs}
 * are served as {@code application/octet-stream}. Browsers enforce strict MIME checking for module
 * scripts and refuse to execute them, which breaks the PDF.js worker (and in turn stalls the
 * pdfium/wasm engine that depends on it).
 *
 * <p>A low-order Vert.x route runs before the static handler and registers a headers-end hook that
 * rewrites the {@code Content-Type} just before the response is flushed - overriding whatever the
 * static handler set, regardless of which handler ultimately serves the file. {@code .wasm} is set
 * defensively to {@code application/wasm} so {@code WebAssembly.instantiateStreaming} works.
 */
@ApplicationScoped
public class StaticResourceMimeConfig {

    private static final String JS_MODULE_TYPE = "text/javascript; charset=utf-8";
    private static final String WASM_TYPE = "application/wasm";

    void registerMimeOverrides(@Observes Router router) {
        router.route().order(-1000).handler(StaticResourceMimeConfig::overrideModuleMime);
    }

    private static void overrideModuleMime(RoutingContext rc) {
        String path = rc.request().path();
        if (path != null) {
            String contentType = null;
            if (path.endsWith(".mjs")) {
                contentType = JS_MODULE_TYPE;
            } else if (path.endsWith(".wasm")) {
                contentType = WASM_TYPE;
            }
            if (contentType != null) {
                String resolved = contentType;
                rc.addHeadersEndHandler(v -> rc.response().headers().set("Content-Type", resolved));
            }
        }
        rc.next();
    }
}
