package stirling.software.common.model.io;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;

/** Classpath-backed {@link Resource} (migration shim for Spring's {@code ClassPathResource}). */
public class ClassPathResource implements Resource {

    private final String path;
    private final ClassLoader classLoader;

    public ClassPathResource(String path) {
        this(path, ClassPathResource.class.getClassLoader());
    }

    public ClassPathResource(String path, ClassLoader classLoader) {
        this.path = path.startsWith("/") ? path.substring(1) : path;
        this.classLoader = classLoader != null ? classLoader : ClassLoader.getSystemClassLoader();
    }

    @Override
    public InputStream getInputStream() throws IOException {
        InputStream is = classLoader.getResourceAsStream(path);
        if (is == null) {
            throw new IOException("class path resource [" + path + "] cannot be opened");
        }
        return is;
    }

    @Override
    public boolean exists() {
        return classLoader.getResource(path) != null;
    }

    @Override
    public String getFilename() {
        int sep = path.lastIndexOf('/');
        return sep != -1 ? path.substring(sep + 1) : path;
    }

    @Override
    public long contentLength() throws IOException {
        try (InputStream is = getInputStream()) {
            long count = 0;
            byte[] buf = new byte[8192];
            int read;
            while ((read = is.read(buf)) != -1) {
                count += read;
            }
            return count;
        }
    }

    @Override
    public File getFile() throws IOException {
        URL url = classLoader.getResource(path);
        if (url == null || !"file".equals(url.getProtocol())) {
            throw new IOException("class path resource [" + path + "] is not a filesystem file");
        }
        return new File(url.getFile());
    }
}
