package stirling.software.proprietary.policy.network;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Vector;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;
import com.jcraft.jsch.SftpException;

/**
 * SFTP client over jsch. Host-key checking is disabled (trust-on-first-use): the operator
 * configures the connection deliberately, and pinning a key would need a UI to capture it first - a
 * follow-up. Directories are listed, read and deleted through one channel; a blank directory means
 * the login home. Symlinked directories are not followed and hidden entries are skipped, mirroring
 * the folder source.
 */
final class SftpFileClient implements RemoteFileClient {

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int MAX_DEPTH = 64;

    private final Session session;
    private final ChannelSftp channel;

    private SftpFileClient(Session session, ChannelSftp channel) {
        this.session = session;
        this.channel = channel;
    }

    static SftpFileClient connect(NetworkConfig config) throws IOException {
        JSch jsch = new JSch();
        try {
            if (config.privateKey() != null) {
                byte[] passphrase =
                        config.privateKeyPassphrase() == null
                                ? null
                                : config.privateKeyPassphrase().getBytes(StandardCharsets.UTF_8);
                jsch.addIdentity(
                        "network-source",
                        config.privateKey().getBytes(StandardCharsets.UTF_8),
                        null,
                        passphrase);
            }
            Session session = jsch.getSession(config.username(), config.host(), config.port());
            if (config.password() != null) {
                session.setPassword(config.password());
            }
            session.setConfig("StrictHostKeyChecking", "no");
            session.connect(CONNECT_TIMEOUT_MS);
            ChannelSftp channel = (ChannelSftp) session.openChannel("sftp");
            channel.connect(CONNECT_TIMEOUT_MS);
            return new SftpFileClient(session, channel);
        } catch (JSchException e) {
            throw new IOException(
                    "SFTP connection to " + config.host() + " failed: " + e.getMessage(), e);
        }
    }

    @Override
    public List<RemoteFile> list(String directory, boolean recursive) throws IOException {
        List<RemoteFile> files = new ArrayList<>();
        collect(dir(directory), recursive, 0, files);
        return files;
    }

    @SuppressWarnings("unchecked")
    private void collect(String directory, boolean recursive, int depth, List<RemoteFile> out)
            throws IOException {
        Vector<ChannelSftp.LsEntry> entries;
        try {
            entries = channel.ls(directory);
        } catch (SftpException e) {
            throw new IOException("cannot list " + directory + ": " + e.getMessage(), e);
        }
        for (ChannelSftp.LsEntry entry : entries) {
            String name = entry.getFilename();
            if (name.equals(".") || name.equals("..") || name.startsWith(".")) {
                continue;
            }
            SftpATTRS attrs = entry.getAttrs();
            String path = join(directory, name);
            if (attrs.isDir()) {
                if (recursive && !attrs.isLink() && depth < MAX_DEPTH) {
                    collect(path, true, depth + 1, out);
                }
                continue;
            }
            if (attrs.isReg()) {
                out.add(new RemoteFile(path, name, attrs.getSize(), attrs.getMTime() * 1000L));
            }
        }
    }

    @Override
    public RemoteFile stat(String path) throws IOException {
        try {
            SftpATTRS attrs = channel.stat(path);
            String name = path.substring(path.lastIndexOf('/') + 1);
            return new RemoteFile(path, name, attrs.getSize(), attrs.getMTime() * 1000L);
        } catch (SftpException e) {
            if (e.id == ChannelSftp.SSH_FX_NO_SUCH_FILE) {
                return null;
            }
            throw new IOException("cannot stat " + path + ": " + e.getMessage(), e);
        }
    }

    @Override
    public InputStream open(String path) throws IOException {
        try {
            return channel.get(path);
        } catch (SftpException e) {
            throw new IOException("cannot read " + path + ": " + e.getMessage(), e);
        }
    }

    @Override
    public void delete(String path) throws IOException {
        try {
            channel.rm(path);
        } catch (SftpException e) {
            if (e.id == ChannelSftp.SSH_FX_NO_SUCH_FILE) {
                return;
            }
            throw new IOException("cannot delete " + path + ": " + e.getMessage(), e);
        }
    }

    @Override
    public void close() {
        channel.disconnect();
        session.disconnect();
    }

    private static String dir(String directory) {
        return directory == null || directory.isBlank() ? "." : directory;
    }

    private static String join(String directory, String name) {
        if (directory.equals(".")) {
            return name;
        }
        return directory.endsWith("/") ? directory + name : directory + "/" + name;
    }
}
