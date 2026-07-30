package stirling.software.proprietary.security.migration;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Comparator;
import java.util.stream.Stream;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

/** Converts the embedded H2 database from the 2.3 file format to 2.4. */
@Slf4j
public final class H2DatabaseMigration {

    public static final String OLD_DATABASE_NAME = "stirling-pdf-DB-2.3.232";
    public static final String NEW_DATABASE_NAME = "stirling-pdf-DB-2.4.240";
    private static final String OLD_H2_RESOURCE = "h2-migration/h2-2.3.232.jar";

    private H2DatabaseMigration() {}

    /** Runs before Spring creates the application DataSource. */
    public static void migrateIfNeeded() throws IOException {
        Path configDirectory = Path.of(InstallationPathConfig.getConfigPath()).toAbsolutePath();
        migrateIfNeeded(configDirectory, findOldH2Jar());
    }

    static void migrateIfNeeded(Path configDirectory, Path oldH2Jar) throws IOException {
        Path oldDatabase = configDirectory.resolve(OLD_DATABASE_NAME + ".mv.db");
        Path newDatabase = configDirectory.resolve(NEW_DATABASE_NAME + ".mv.db");

        if (!Files.exists(oldDatabase) || Files.exists(newDatabase)) {
            return;
        }

        log.info("Found legacy H2 database {}; migrating to H2 2.4.240", oldDatabase);
        Files.createDirectories(configDirectory);
        Path workDirectory = Files.createTempDirectory(configDirectory, ".h2-migration-");
        Path sourceCopy = workDirectory.resolve(OLD_DATABASE_NAME);
        Path script = workDirectory.resolve("database.sql");
        Path targetBase = workDirectory.resolve(NEW_DATABASE_NAME);

        try {
            Files.copy(oldDatabase, sourceCopy.resolveSibling(sourceCopy.getFileName() + ".mv.db"));
            exportWithLegacyDriver(sourceCopy, script, oldH2Jar);
            importWithCurrentDriver(targetBase, script);
            verifyDatabase(targetBase);
            Files.move(
                    targetBase.resolveSibling(targetBase.getFileName() + ".mv.db"),
                    newDatabase,
                    StandardCopyOption.REPLACE_EXISTING);
            log.info("H2 database migration completed: {}", newDatabase);
        } catch (Exception e) {
            deleteRecursively(workDirectory);
            throw new IOException("Could not migrate the embedded H2 database", unwrap(e));
        }

        deleteRecursively(workDirectory);
    }

    private static Path findOldH2Jar() throws IOException {
        URL resource = H2DatabaseMigration.class.getClassLoader().getResource(OLD_H2_RESOURCE);
        if (resource == null) {
            throw new IOException("Bundled H2 2.3.232 migration driver is missing");
        }
        Path extracted = Files.createTempFile("stirling-h2-2.3.232-", ".jar");
        try (var input = resource.openStream()) {
            Files.copy(input, extracted, StandardCopyOption.REPLACE_EXISTING);
        }
        extracted.toFile().deleteOnExit();
        return extracted;
    }

    private static void exportWithLegacyDriver(Path database, Path script, Path oldH2Jar)
            throws Exception {
        String url =
                "jdbc:h2:file:"
                        + database.toAbsolutePath()
                        + ";IFEXISTS=TRUE;ACCESS_MODE_DATA=r;DB_CLOSE_ON_EXIT=FALSE;MODE=PostgreSQL";
        ClassLoader previous = Thread.currentThread().getContextClassLoader();
        try (URLClassLoader loader =
                new URLClassLoader(
                        new URL[] {oldH2Jar.toUri().toURL()},
                        ClassLoader.getPlatformClassLoader())) {
            Thread.currentThread().setContextClassLoader(loader);
            Class<?> scriptTool = Class.forName("org.h2.tools.Script", true, loader);
            Method process =
                    scriptTool.getMethod(
                            "process",
                            String.class,
                            String.class,
                            String.class,
                            String.class,
                            String.class,
                            String.class);
            process.invoke(null, url, "sa", "", script.toAbsolutePath().toString(), "", "");
        } catch (InvocationTargetException e) {
            throw unwrap(e);
        } finally {
            Thread.currentThread().setContextClassLoader(previous);
        }
    }

    private static void importWithCurrentDriver(Path database, Path script) throws SQLException {
        String url =
                "jdbc:h2:file:"
                        + database.toAbsolutePath()
                        + ";DB_CLOSE_ON_EXIT=FALSE;MODE=PostgreSQL";
        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            try (PreparedStatement statement = connection.prepareStatement("RUNSCRIPT FROM ?")) {
                statement.setString(1, script.toAbsolutePath().toString());
                statement.execute();
            }
        }
    }

    private static void verifyDatabase(Path database) throws SQLException {
        String url = "jdbc:h2:file:" + database.toAbsolutePath() + ";IFEXISTS=TRUE";
        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            try (PreparedStatement statement =
                    connection.prepareStatement("SELECT H2VERSION() FROM DUAL")) {
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next() || !result.getString(1).startsWith("2.4.")) {
                        throw new SQLException("Migrated database does not use H2 2.4");
                    }
                }
            }
        }
    }

    private static Exception unwrap(Exception exception) {
        if (exception instanceof InvocationTargetException invocation
                && invocation.getCause() != null) {
            if (invocation.getCause() instanceof Exception cause) {
                return cause;
            }
            return new IOException("Legacy H2 migration failed", invocation.getCause());
        }
        return exception;
    }

    private static void deleteRecursively(Path directory) {
        try (Stream<Path> paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder())
                    .forEach(
                            path -> {
                                try {
                                    Files.deleteIfExists(path);
                                } catch (IOException e) {
                                    log.debug(
                                            "Could not remove temporary migration file {}",
                                            path,
                                            e);
                                }
                            });
        } catch (IOException e) {
            log.debug("Could not remove temporary migration directory {}", directory, e);
        }
    }
}
