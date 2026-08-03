package stirling.software.proprietary.policy.network;

import java.io.File;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

import stirling.software.common.model.io.Resource;

/**
 * A policy input backed by a remote file, streamed on demand. Each read opens its own short-lived
 * client (the listing client is long gone by the time the run reads the file) and hands it to the
 * stream, so closing the stream tears the session down. Size and name come from the listing, so the
 * pipeline can size the input without a second round trip.
 */
final class RemoteFileResource implements Resource {

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

    /** Remote-only: there is no local file to hand out, callers must stream it. */
    @Override
    public File getFile() throws IOException {
        throw new IOException(
                "network file "
                        + NetworkIdentities.identity(config, file.path())
                        + " is not backed by a local file");
    }
}
