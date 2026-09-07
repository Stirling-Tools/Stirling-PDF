package stirling.software.proprietary.policy.network;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

import org.springframework.core.io.AbstractResource;

/**
 * A policy input backed by a remote file, streamed on demand. Each read opens its own short-lived
 * client (the listing client is long gone by the time the run reads the file) and hands it to the
 * stream, so closing the stream tears the session down. Size and name come from the listing, so the
 * pipeline can size the input without a second round trip.
 */
final class RemoteFileResource extends AbstractResource {

    private final RemoteFileClientFactory factory;
    private final NetworkConfig config;
    private final RemoteFile file;

    RemoteFileResource(RemoteFileClientFactory factory, NetworkConfig config, RemoteFile file) {
        this.factory = factory;
        this.config = config;
        this.file = file;
    }

    @Override
    public InputStream getInputStream() throws IOException {
        RemoteFileClient client = factory.connect(config);
        try {
            InputStream stream = client.open(file.path());
            return new FilterInputStream(stream) {
                @Override
                public void close() throws IOException {
                    try {
                        super.close();
                    } finally {
                        client.close();
                    }
                }
            };
        } catch (IOException e) {
            client.close();
            throw e;
        }
    }

    /** Listed just now; a reader gets a precise error from {@link #getInputStream} instead. */
    @Override
    public boolean exists() {
        return true;
    }

    @Override
    public long contentLength() {
        return file.size();
    }

    @Override
    public String getFilename() {
        return file.name();
    }

    @Override
    public String getDescription() {
        return "network file " + NetworkIdentities.identity(config, file.path());
    }
}
