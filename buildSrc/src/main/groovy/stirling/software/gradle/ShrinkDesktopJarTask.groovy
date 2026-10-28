package stirling.software.gradle

import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.file.ConfigurableFileCollection
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Classpath
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.TaskAction

import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

/**
 * Shrinks the packaged desktop JAR with ProGuard.
 *
 * <p>The Spring Boot archive is exploded into one flat program-class tree plus a merged resource
 * tree, because ProGuard shrinks classes but must never touch resources: component scanning,
 * {@code META-INF/services}, and {@code spring.factories} all address classes by name. Multi-release
 * entries are resolved to the target JDK first, otherwise the JDK 17 fallback of e.g.
 * {@code VirtualThreadDelegate} is what ships.
 *
 * <p>Output is a flat executable JAR with {@code Main-Class: SPDFApplication}; the desktop sidecar
 * is launched with {@code java -jar}, so the Spring Boot launcher is not needed.
 */
abstract class ShrinkDesktopJarTask extends DefaultTask {

    private static final String MR_PREFIX = 'META-INF/versions/'
    private static final Set<String> SKIPPED_RESOURCES = [
            'META-INF/MANIFEST.MF',
            'META-INF/INDEX.LIST',
            'META-INF/DEPENDENCIES',
            'META-INF/LICENSE',
            'META-INF/LICENSE.txt',
            'META-INF/NOTICE',
            'META-INF/NOTICE.txt'
    ] as Set
    private static final List<String> SKIPPED_SUFFIXES = ['.SF', '.RSA', '.DSA']
    private static final String JARMODE_KEY = 'org.springframework.boot.loader.jarmode.JarMode'

    @InputFile
    abstract RegularFileProperty getBootJar()

    @OutputFile
    abstract RegularFileProperty getShrunkJar()

    @InputFile
    abstract RegularFileProperty getStaticRules()

    @Input
    abstract Property<Integer> getTargetJava()

    @Input
    abstract Property<String> getImplementationVersion()

    @Input
    abstract Property<String> getLibraryJars()

    @Input
    abstract Property<Boolean> getShrinkEnabled()

    @Classpath
    abstract ConfigurableFileCollection getProguardClasspath()

    @TaskAction
    void shrink() {
        if (!shrinkEnabled.get()) {
            Files.createDirectories(shrunkJar.get().asFile.parentFile.toPath())
            Files.copy(bootJar.get().asFile.toPath(), shrunkJar.get().asFile.toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING)
            logger.lifecycle("ProGuard shrinking disabled; staged the boot JAR unchanged")
            return
        }
        Path work = Files.createTempDirectory('stirling-proguard')
        try {
            Path classesDir = work.resolve('classes')
            Path resourcesDir = work.resolve('resources')
            Files.createDirectories(classesDir)
            Files.createDirectories(resourcesDir)

            Map<String, byte[]> resources = new LinkedHashMap<>()
            Map<String, List<String>> services = new TreeMap<>()
            Map<String, List<String>> factories = new LinkedHashMap<>()
            Map<String, Map.Entry<Integer, byte[]>> multiRelease = new LinkedHashMap<>()

            explode(classesDir, resources, services, factories, multiRelease)
            applyMultiRelease(classesDir, resources, multiRelease)
            writeResources(resourcesDir, resources, services, factories)

            Path proguardConfig = work.resolve('proguard.pro')
            writeProguardConfig(proguardConfig, classesDir, services, factories)
            Path shrunkClasses = work.resolve('classes-out.jar')
            runProguard(proguardConfig, shrunkClasses)
            pack(shrunkClasses, resourcesDir)

            logger.lifecycle(
                    "Shrunk desktop JAR: {} -> {} bytes",
                    bootJar.get().asFile.length(),
                    shrunkJar.get().asFile.length())
        } finally {
            work.toFile().deleteDir()
        }
    }

    void explode(
            Path classesDir,
            Map<String, byte[]> resources,
            Map<String, List<String>> services,
            Map<String, List<String>> factories,
            Map<String, Map.Entry<Integer, byte[]>> multiRelease) {
        new ZipFile(bootJar.get().asFile).withCloseable { ZipFile outer ->
            for (ZipEntry entry : outer.entries()) {
                if (entry.directory) {
                    continue
                }
                String name = entry.name
                if (name.startsWith('BOOT-INF/classes/')) {
                    addEntry(name.substring('BOOT-INF/classes/'.length()),
                            outer.getInputStream(entry).readAllBytes(),
                            classesDir, resources, services, factories, multiRelease)
                } else if (name.startsWith('BOOT-INF/lib/') && name.endsWith('.jar')) {
                    new ZipFile(workFile(outer, entry)).withCloseable { ZipFile nested ->
                        for (ZipEntry inner : nested.entries()) {
                            if (inner.directory) {
                                continue
                            }
                            addEntry(inner.name, nested.getInputStream(inner).readAllBytes(),
                                    classesDir, resources, services, factories, multiRelease)
                        }
                    }
                }
            }
        }
    }

    File workFile(ZipFile outer, ZipEntry entry) {
        Path temp = Files.createTempFile('nested', '.jar')
        Files.copy(outer.getInputStream(entry), temp, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
        File file = temp.toFile()
        file.deleteOnExit()
        return file
    }

    void addEntry(
            String name,
            byte[] data,
            Path classesDir,
            Map<String, byte[]> resources,
            Map<String, List<String>> services,
            Map<String, List<String>> factories,
            Map<String, Map.Entry<Integer, byte[]>> multiRelease) {
        if (name.endsWith('module-info.class') || name in SKIPPED_RESOURCES) {
            return
        }
        if (name.startsWith('META-INF/') && SKIPPED_SUFFIXES.any { name.endsWith(it) }) {
            return
        }
        if (name.startsWith(MR_PREFIX)) {
            captureMultiRelease(name, data, multiRelease)
            return
        }
        if (name == 'META-INF/spring.factories') {
            parseFactories(new String(data, StandardCharsets.UTF_8), factories)
            return
        }
        // AutoConfiguration.imports and the Spring schema/handler maps are per-jar line lists;
        // taking the first copy drops every other module's auto-configuration.
        if (name.startsWith('META-INF/services/') || name.startsWith('META-INF/spring/')) {
            List<String> lines = services.computeIfAbsent(name) { [] }
            mergeLines(lines, new String(data, StandardCharsets.UTF_8))
            return
        }
        if (name.endsWith('.class')) {
            Path target = classesDir.resolve(name)
            Files.createDirectories(target.parent)
            Files.write(target, data)
            return
        }
        resources.putIfAbsent(name, data)
    }

    void captureMultiRelease(
            String name, byte[] data, Map<String, Map.Entry<Integer, byte[]>> multiRelease) {
        List<String> parts = name.substring(MR_PREFIX.length()).split('/', 2) as List<String>
        if (parts.size() != 2 || !(parts[0] ==~ /\d+/)) {
            return
        }
        int version = parts[0] as int
        if (version > targetJava.get()) {
            return
        }
        Map.Entry<Integer, byte[]> current = multiRelease.get(parts[1])
        if (current == null || version > current.key) {
            multiRelease.put(parts[1], new AbstractMap.SimpleImmutableEntry<>(version, data))
        }
    }

    void applyMultiRelease(
            Path classesDir, Map<String, byte[]> resources, Map<String, Map.Entry<Integer, byte[]>> multiRelease) {
        multiRelease.each { String name, Map.Entry<Integer, byte[]> entry ->
            if (name.endsWith('.class')) {
                Path target = classesDir.resolve(name)
                Files.createDirectories(target.parent)
                Files.write(target, entry.value)
            } else {
                resources.put(name, entry.value)
            }
        }
    }

    static void mergeLines(List<String> target, String text) {
        text.readLines().each { String raw ->
            String line = raw.split('#', 2)[0].trim()
            if (line && !target.contains(line)) {
                target.add(line)
            }
        }
    }

    static void parseFactories(String text, Map<String, List<String>> factories) {
        String joined = text.replace('\\\r\n', '').replace('\\\n', '')
        joined.readLines().each { String raw ->
            String line = raw.trim()
            if (!line || line.startsWith('#') || !line.contains('=')) {
                return
            }
            int split = line.indexOf('=')
            String key = line.substring(0, split).trim()
            if (!key || key == JARMODE_KEY) {
                return
            }
            List<String> values = factories.computeIfAbsent(key) { [] }
            line.substring(split + 1).split(',').each { String value ->
                String trimmed = value.trim()
                if (trimmed && !values.contains(trimmed)) {
                    values.add(trimmed)
                }
            }
        }
    }

    void writeResources(
            Path resourcesDir,
            Map<String, byte[]> resources,
            Map<String, List<String>> services,
            Map<String, List<String>> factories) {
        resources.each { String name, byte[] data ->
            Path target = resourcesDir.resolve(name)
            Files.createDirectories(target.parent)
            Files.write(target, data)
        }
        services.each { String name, List<String> lines ->
            Path target = resourcesDir.resolve(name)
            Files.createDirectories(target.parent)
            Files.write(target, (lines.join('\n') + '\n').getBytes(StandardCharsets.UTF_8))
        }
        Path factoriesFile = resourcesDir.resolve('META-INF/spring.factories')
        Files.createDirectories(factoriesFile.parent)
        StringBuilder builder = new StringBuilder()
        factories.each { String key, List<String> values ->
            builder.append(key).append('=').append(values.join(',')).append('\n')
        }
        Files.write(factoriesFile, builder.toString().getBytes(StandardCharsets.UTF_8))
    }

    void writeProguardConfig(
            Path config,
            Path classesDir,
            Map<String, List<String>> services,
            Map<String, List<String>> factories) {
        String libraryJars = this.libraryJars.get()
        if (!new File(libraryJars).exists()) {
            throw new GradleException(
                    "ProGuard needs a JDK with jmods at '${libraryJars}'. Point -PproguardJmods at " +
                            "a full JDK 25 install, or build with -PshrinkDesktopJar=false.")
        }
        StringBuilder builder = new StringBuilder()
        builder.append(staticRules.get().asFile.getText('UTF-8')).append('\n')
        builder.append("-injars '").append(classesDir).append("'\n")
        builder.append("-outjars '").append(config.parent.resolve('classes-out.jar')).append("'\n")
        builder.append("-libraryjars '").append(libraryJars).append("'\n")
        Set<String> keeps = new TreeSet<>()
        services.each { String name, List<String> lines ->
            // spring.handlers/spring.schemas are key=value maps, not class lists.
            if (name.startsWith('META-INF/services/') || name.endsWith('.imports')) {
                lines.each { keeps.add(it) }
            }
        }
        factories.values().each { List<String> values -> values.each { keeps.add(it) } }
        keeps.findAll { it ==~ /[A-Za-z_$][A-Za-z0-9_$.]*/ }.each {
            builder.append("-keep class ").append(it).append(" { *; }\n")
        }
        Files.write(config, builder.toString().getBytes(StandardCharsets.UTF_8))
    }

    void runProguard(Path config, Path outputJar) {
        List<String> command = [
                new File(System.getProperty('java.home'), 'bin/java').absolutePath,
                '-Xmx6g',
                '-cp',
                proguardClasspath.files.collect { it.absolutePath }.join(File.pathSeparator),
                'proguard.ProGuard',
                '@' + config.toAbsolutePath()
        ]
        Process process = new ProcessBuilder(command)
                .redirectErrorStream(true)
                .directory(config.parent.toFile())
                .start()
        String log = process.inputStream.text
        int exit = process.waitFor()
        if (exit != 0 || !Files.exists(outputJar)) {
            throw new GradleException("ProGuard failed (exit ${exit}):\n${log.takeRight(4000)}")
        }
    }

    void pack(Path shrunkClasses, Path resourcesDir) {
        File output = shrunkJar.get().asFile
        Files.createDirectories(output.parentFile.toPath())
        new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(output))).withCloseable { ZipOutputStream out ->
            out.setLevel(6)
            ZipEntry manifestEntry = new ZipEntry('META-INF/MANIFEST.MF')
            out.putNextEntry(manifestEntry)
            out.write(manifest().getBytes(StandardCharsets.UTF_8))
            out.closeEntry()

            new ZipFile(shrunkClasses.toFile()).withCloseable { ZipFile classes ->
                for (ZipEntry entry : classes.entries()) {
                    if (entry.name == 'META-INF/MANIFEST.MF') {
                        continue
                    }
                    out.putNextEntry(new ZipEntry(entry.name))
                    if (!entry.directory) {
                        out.write(classes.getInputStream(entry).readAllBytes())
                    }
                    out.closeEntry()
                }
            }
            Files.walk(resourcesDir).sorted().each { Path path ->
                if (!Files.isDirectory(path)) {
                    String name = resourcesDir.relativize(path).toString().replace(File.separatorChar, '/' as char)
                    out.putNextEntry(new ZipEntry(name))
                    out.write(Files.readAllBytes(path))
                    out.closeEntry()
                }
            }
        }
    }

    String manifest() {
        StringBuilder builder = new StringBuilder()
        builder.append('Manifest-Version: 1.0\n')
        builder.append('Implementation-Title: Stirling-PDF\n')
        builder.append("Implementation-Version: ${implementationVersion.get()}\n")
        builder.append('Enable-Native-Access: ALL-UNNAMED\n')
        builder.append('Main-Class: stirling.software.SPDF.SPDFApplication\n')
        builder.append('\n')
        return builder.toString()
    }
}
