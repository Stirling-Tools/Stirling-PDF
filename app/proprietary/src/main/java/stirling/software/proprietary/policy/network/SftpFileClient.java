package stirling.software.proprietary.policy.network;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Vector;

import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.HostKey;
import com.jcraft.jsch.HostKeyRepository;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;
import com.jcraft.jsch.SftpException;
import com.jcraft.jsch.UserInfo;

import stirling.software.common.configuration.InstallationPathConfig;

/**
 * SFTP client over jsch. Host keys are verified: a connection with a configured {@code
 * hostKeyFingerprint} only accepts the server presenting that key; otherwise the key seen on the
 * first connect is pinned in a known-hosts file under the config directory and any later change is
 * refused (trust-on-first-use). Directories are listed, read and deleted through one channel; a
 * blank directory means the login home. Symlinked directories are not followed and hidden entries
 * are skipped, mirroring the folder source.
 */
final class SftpFileClient implements RemoteFileClient {

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    private static final int MAX_DEPTH = 64;
    static final String KNOWN_HOSTS_FILE = "sftp_known_hosts";

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
                byte[] passphrase = config.privateKeyPassphrase() == null
                        ? null
                        : config.privateKeyPassphrase().getBytes(StandardCharsets.UTF_8);
                jsch.addIdentity(
                        "network-source", config.privateKey().getBytes(StandardCharsets.UTF_8), null, passphrase);
            }
            Session session = jsch.getSession(config.username(), config.host(), config.port());
            if (config.password() != null) {
                session.setPassword(config.password());
            }
            if (config.hostKeyFingerprint() != null) {
                // Pinned key: only the configured fingerprint is ever accepted.
                session.setHostKeyRepository(new PinnedHostKeyRepository(config.hostKeyFingerprint()));
            } else {
                // Trust-on-first-use: the first key seen is recorded, a changed key is refused.
                jsch.setKnownHosts(knownHostsFile().toString());
                session.setHostKeyRepository(new TofuHostKeyRepository(jsch.getHostKeyRepository()));
            }
            session.setConfig("StrictHostKeyChecking", "yes");
            session.connect(CONNECT_TIMEOUT_MS);
            session.setTimeout(READ_TIMEOUT_MS);
            ChannelSftp channel = (ChannelSftp) session.openChannel("sftp");
            channel.connect(CONNECT_TIMEOUT_MS);
            return new SftpFileClient(session, channel);
        } catch (JSchException e) {
            throw new IOException("SFTP connection to " + config.host() + " failed: " + e.getMessage(), e);
        }
    }

    /** jsch only persists newly pinned keys into a file that already exists, so create it. */
    private static Path knownHostsFile() throws IOException {
        Path file = Path.of(InstallationPathConfig.getConfigPath(), KNOWN_HOSTS_FILE);
        Files.createDirectories(file.getParent());
        try {
            Files.createFile(file);
        } catch (FileAlreadyExistsException ignored) {
            // Another connect already created it; the content is managed by jsch.
        }
        return file;
    }

    /**
     * Trust-on-first-use over the shared known-hosts file: an unknown host's key is pinned on first
     * contact, and a key that later differs is refused ({@code CHANGED}). Rejection happens before
     * authentication, so credentials are never sent to an impersonating server.
     */
    private static final class TofuHostKeyRepository implements HostKeyRepository {

        private final HostKeyRepository knownHosts;

        private TofuHostKeyRepository(HostKeyRepository knownHosts) {
            this.knownHosts = knownHosts;
        }

        @Override
        public int check(String host, byte[] key) {
            int result = knownHosts.check(host, key);
            if (result != NOT_INCLUDED) {
                return result;
            }
            try {
                knownHosts.add(new HostKey(host, key), null);
            } catch (JSchException e) {
                return CHANGED; // a key we cannot even parse is refused, not trusted
            }
            return OK;
        }

        @Override
        public void add(HostKey hostkey, UserInfo ui) {
            knownHosts.add(hostkey, ui);
        }

        @Override
        public void remove(String host, String type) {
            knownHosts.remove(host, type);
        }

        @Override
        public void remove(String host, String type, byte[] key) {
            knownHosts.remove(host, type, key);
        }

        @Override
        public String getKnownHostsRepositoryID() {
            return knownHosts.getKnownHostsRepositoryID();
        }

        @Override
        public HostKey[] getHostKey() {
            return knownHosts.getHostKey();
        }

        @Override
        public HostKey[] getHostKey(String host, String type) {
            return knownHosts.getHostKey(host, type);
        }
    }

    /**
     * Accepts only the server key whose SHA-256 fingerprint matches the configured value (OpenSSH
     * {@code SHA256:base64} form, prefix optional). Rejection happens before authentication, so
     * credentials are never sent to an impersonating server.
     */
    private static final class PinnedHostKeyRepository implements HostKeyRepository {

        private final String expected;

        private PinnedHostKeyRepository(String fingerprint) {
            this.expected = normalize(fingerprint);
        }

        @Override
        public int check(String host, byte[] key) {
            return expected.equals(sha256Fingerprint(key)) ? OK : CHANGED;
        }

        private static String normalize(String fingerprint) {
            String value = fingerprint.trim();
            if (value.toUpperCase(Locale.ROOT).startsWith("SHA256:")) {
                value = value.substring("SHA256:".length());
            }
            // OpenSSH prints the digest base64 without padding; accept it padded too.
            return value.replace("=", "");
        }

        private static String sha256Fingerprint(byte[] key) {
            try {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                return Base64.getEncoder().withoutPadding().encodeToString(digest.digest(key));
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException("SHA-256 unavailable", e);
            }
        }

        @Override
        public void add(HostKey hostkey, UserInfo ui) {}

        @Override
        public void remove(String host, String type) {}

        @Override
        public void remove(String host, String type, byte[] key) {}

        @Override
        public String getKnownHostsRepositoryID() {
            return "pinned-fingerprint";
        }

        @Override
        public HostKey[] getHostKey() {
            return new HostKey[0];
        }

        @Override
        public HostKey[] getHostKey(String host, String type) {
            return new HostKey[0];
        }
    }

    @Override
    public List<RemoteFile> list(String directory, boolean recursive) throws IOException {
        List<RemoteFile> files = new ArrayList<>();
        collect(dir(directory), recursive, 0, files);
        return files;
    }

    @SuppressWarnings("unchecked")
    private void collect(String directory, boolean recursive, int depth, List<RemoteFile> out) throws IOException {
        Vector<ChannelSftp.LsEntry> entries;
        try {
            entries = channel.ls(directory);
        } catch (SftpException e) {
            throw new IOException("cannot list " + directory + ": " + e.getMessage(), e);
        }
        for (ChannelSftp.LsEntry entry : entries) {
            if (out.size() >= MAX_FILES) {
                return;
            }
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
