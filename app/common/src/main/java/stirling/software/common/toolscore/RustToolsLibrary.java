package stirling.software.common.toolscore;

import static java.lang.foreign.ValueLayout.ADDRESS;
import static java.lang.foreign.ValueLayout.JAVA_INT;

import java.io.IOException;
import java.io.InputStream;
import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.SymbolLookup;
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import lombok.extern.slf4j.Slf4j;

import stirling.software.jpdfium.panama.NativeGuard;
import stirling.software.jpdfium.panama.NativeLoader;
import stirling.software.jpdfium.panama.Symbols;

/**
 * A tools-core library (the shared Rust in {@code tools-core/}) loaded natively. The editor runs
 * the same code as wasm, so a tool here produces what the browser produces from the same PDFium.
 *
 * <p>A library has no PDFium of its own: on load, {@code stirling_tools_bind} resolves every PDFium
 * function by name from the copy jpdfium already loaded, so documents opened through jpdfium can be
 * handed straight to it. {@link #run} makes calls under jpdfium's {@link NativeGuard} lock, because
 * PDFium is not thread-safe.
 *
 * <p>Every library follows one convention: a call returns 0, leaving any result as JSON for {@code
 * stirling_last_result}, or fails, leaving a message for {@code stirling_last_error}. Both are per
 * thread, which is why {@link #run} reads them inside the same locked call.
 *
 * <p>Libraries load on first use and stay loaded. A build made without cargo does not bundle them,
 * and {@link #named} then returns empty for the life of the process.
 */
@Slf4j
public final class RustToolsLibrary {

    // Hazard: gradle/tools-core-native.gradle bundles libraries under this path.
    private static final String RESOURCE_DIR = "tools-core/natives/";
    private static final long MAX_STRING_LENGTH = 1 << 20;

    private static final Linker LINKER = Linker.nativeLinker();
    private static final FunctionDescriptor RESOLVE_SIGNATURE =
            FunctionDescriptor.of(ADDRESS, ADDRESS);
    private static final FunctionDescriptor BIND_SIGNATURE =
            FunctionDescriptor.of(JAVA_INT, ADDRESS);
    private static final FunctionDescriptor STRING_SIGNATURE = FunctionDescriptor.of(ADDRESS);

    private static final Map<String, Optional<RustToolsLibrary>> LOADED = new ConcurrentHashMap<>();

    private final SymbolLookup lookup;
    private final Map<String, MethodHandle> functions = new ConcurrentHashMap<>();
    private final MethodHandle lastError;
    private final MethodHandle lastResult;

    /** A call into a library, returning its status. */
    @FunctionalInterface
    public interface NativeCall {
        int call() throws Throwable;
    }

    private RustToolsLibrary(SymbolLookup lookup) {
        this.lookup = lookup;
        this.lastError = function("stirling_last_error", STRING_SIGNATURE);
        this.lastResult = function("stirling_last_result", STRING_SIGNATURE);
    }

    /**
     * The library built from the cargo package {@code name} (with {@code -} as {@code _}), or empty
     * when it is not bundled for this platform or failed to load.
     */
    public static Optional<RustToolsLibrary> named(String name) {
        return LOADED.computeIfAbsent(name, RustToolsLibrary::loadOrEmpty);
    }

    /** A downcall handle for one of the library's exports, created once. */
    public MethodHandle function(String symbol, FunctionDescriptor signature) {
        return functions.computeIfAbsent(
                symbol, name -> LINKER.downcallHandle(lookup.findOrThrow(name), signature));
    }

    /**
     * Makes {@code call} under the PDFium lock and returns the library's result.
     *
     * @return the result JSON, or an empty string from a call that sets none
     * @throws IllegalStateException with the library's message if {@code call} fails
     */
    public String run(NativeCall call) {
        return NativeGuard.call(
                () -> {
                    if (invoke(call) != 0) {
                        throw new IllegalStateException(read(lastError));
                    }
                    return read(lastResult);
                });
    }

    /** One of the per-thread strings, so only on the thread that made the call it describes. */
    private static String read(MethodHandle accessor) {
        MemorySegment text;
        try {
            text = (MemorySegment) accessor.invokeExact();
        } catch (RuntimeException | Error e) {
            throw e;
        } catch (Throwable t) {
            throw new IllegalStateException(t);
        }
        return text.reinterpret(MAX_STRING_LENGTH).getString(0);
    }

    private static int invoke(NativeCall call) {
        try {
            return call.call();
        } catch (RuntimeException | Error e) {
            throw e;
        } catch (Throwable t) {
            throw new IllegalStateException(t);
        }
    }

    private static Optional<RustToolsLibrary> loadOrEmpty(String name) {
        try {
            return load(name);
        } catch (IOException | RuntimeException | LinkageError e) {
            log.warn("Rust tools library {} failed to load; its tools are unavailable", name, e);
            return Optional.empty();
        }
    }

    private static Optional<RustToolsLibrary> load(String name) throws IOException {
        String file = System.mapLibraryName(name.replace('-', '_'));
        String resource = RESOURCE_DIR + NativeLoader.detectPlatform() + "/" + file;
        Optional<Path> extracted = extract(resource, file);
        if (extracted.isEmpty()) {
            log.info("Rust tools library not bundled for this platform ({})", resource);
            return Optional.empty();
        }
        RustToolsLibrary library =
                new RustToolsLibrary(SymbolLookup.libraryLookup(extracted.get(), Arena.global()));
        MethodHandle bind = library.function("stirling_tools_bind", BIND_SIGNATURE);
        MemorySegment resolver = pdfiumSymbolResolver();
        if (invoke(() -> (int) bind.invokeExact(resolver)) != 0) {
            throw new IllegalStateException(
                    name + " could not bind PDFium: " + read(library.lastError));
        }
        return Optional.of(library);
    }

    private static Optional<Path> extract(String resource, String file) throws IOException {
        try (InputStream in =
                RustToolsLibrary.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                return Optional.empty();
            }
            Path dir = Files.createTempDirectory("stirling-tools");
            Path library = dir.resolve(file);
            Files.copy(in, library);
            dir.toFile().deleteOnExit();
            library.toFile().deleteOnExit();
            return Optional.of(library);
        }
    }

    private static MemorySegment pdfiumSymbolResolver() {
        try {
            MethodHandle resolve =
                    MethodHandles.lookup()
                            .findStatic(
                                    RustToolsLibrary.class,
                                    "resolvePdfiumSymbol",
                                    MethodType.methodType(
                                            MemorySegment.class, MemorySegment.class));
            return LINKER.upcallStub(resolve, RESOLVE_SIGNATURE, Arena.global());
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Upcall from {@code stirling_tools_bind}. Must not throw: an exception escaping an upcall
     * crashes the JVM, so a failure resolves to NULL, which the library reports by name.
     */
    private static MemorySegment resolvePdfiumSymbol(MemorySegment name) {
        try {
            String symbol = name.reinterpret(MAX_STRING_LENGTH).getString(0);
            return Symbols.find(symbol).orElse(MemorySegment.NULL);
        } catch (RuntimeException e) {
            log.warn("Resolving a PDFium symbol for the Rust tools failed", e);
            return MemorySegment.NULL;
        }
    }
}
