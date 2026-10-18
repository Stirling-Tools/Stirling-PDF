package stirling.software.proprietary.policy.remote;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public interface CloudDrive<L extends CloudLocation, F extends CloudFile> {

    Set<String> types();

    L resolve(String type, Map<String, Object> options);

    void checkReadable(L location) throws IOException;

    void checkWritable(L location) throws IOException;

    List<F> list(L location) throws IOException;

    Optional<F> stat(L location, F file) throws IOException;

    InputStream open(L location, F file) throws IOException;

    boolean remove(L location, F file) throws IOException;

    String outputIdentity(L location, String name) throws IOException;

    ContentHasher newHasher();

    Optional<F> upload(L location, String name, Path content) throws IOException;

    String label();
}
