package stirling.software.SPDF.config;

import java.io.IOException;
import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

import org.snakeyaml.engine.v2.api.Dump;
import org.snakeyaml.engine.v2.api.DumpSettings;
import org.snakeyaml.engine.v2.api.LoadSettings;
import org.snakeyaml.engine.v2.api.StreamDataWriter;
import org.snakeyaml.engine.v2.common.FlowStyle;
import org.snakeyaml.engine.v2.common.ScalarStyle;
import org.snakeyaml.engine.v2.composer.Composer;
import org.snakeyaml.engine.v2.nodes.MappingNode;
import org.snakeyaml.engine.v2.nodes.Node;
import org.snakeyaml.engine.v2.nodes.NodeTuple;
import org.snakeyaml.engine.v2.nodes.ScalarNode;
import org.snakeyaml.engine.v2.nodes.SequenceNode;
import org.snakeyaml.engine.v2.nodes.Tag;
import org.snakeyaml.engine.v2.parser.ParserImpl;
import org.snakeyaml.engine.v2.scanner.StreamReader;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class YamlHelper {

    // YAML dump settings with comment support and block flow style
    private static final DumpSettings DUMP_SETTINGS =
            DumpSettings.builder()
                    .setDumpComments(true)
                    .setWidth(Integer.MAX_VALUE)
                    .setDefaultFlowStyle(FlowStyle.BLOCK)
                    .build();

    private final String yamlContent; // Stores the entire YAML content as a string

    private LoadSettings loadSettings =
            LoadSettings.builder()
                    .setUseMarks(true)
                    .setMaxAliasesForCollections(Integer.MAX_VALUE)
                    .setAllowRecursiveKeys(true)
                    .setParseComments(true)
                    .build();

    private Path originalFilePath;
    private Node updatedRootNode;

    // Constructor with custom LoadSettings and YAML string
    public YamlHelper(LoadSettings loadSettings, String yamlContent) {
        this.loadSettings = loadSettings;
        this.yamlContent = yamlContent;
    }

    // Constructor that reads YAML from a file path
    public YamlHelper(Path originalFilePath) throws IOException {
        this.yamlContent = Files.readString(originalFilePath);
        this.originalFilePath = originalFilePath;
    }

    /**
     * Updates values in the target YAML based on values from the source YAML. It ensures that only
     * existing keys in the target YAML are updated.
     *
     * @return true if at least one key was updated, false otherwise.
     */
    public boolean updateValuesFromYaml(YamlHelper sourceYaml, YamlHelper targetYaml) {
        boolean updated = false;
        Set<String> sourceKeys = sourceYaml.getAllKeys();
        Set<String> targetKeys = targetYaml.getAllKeys();

        for (String key : sourceKeys) {
            String[] keyArray = key.split("\\.");

            Object newValue = sourceYaml.getValueByExactKeyPath(keyArray);
            Object currentValue = targetYaml.getValueByExactKeyPath(keyArray);
            if (newValue != null
                    && (!newValue.equals(currentValue) || !sourceKeys.equals(targetKeys))) {
                boolean updatedKey = targetYaml.updateValue(Arrays.asList(keyArray), newValue);
                if (updatedKey) updated = true;
            }
        }

        return updated;
    }

    /**
     * Updates a value in the YAML structure.
     *
     * @param keys The hierarchical keys leading to the value.
     * @param newValue The new value to set.
     * @return true if the value was updated, false otherwise.
     */
    public boolean updateValue(List<String> keys, Object newValue) {
        return updateValue(getRootNode(), keys, newValue);
    }

    private boolean updateValue(Node node, List<String> keys, Object newValue) {
        if (!(node instanceof MappingNode mappingNode)) return false;

        List<NodeTuple> updatedTuples = new ArrayList<>();
        boolean updated = false;

        for (NodeTuple tuple : mappingNode.getValue()) {
            ScalarNode keyNode = (tuple.getKeyNode() instanceof ScalarNode sk) ? sk : null;
            if (keyNode == null || !keyNode.getValue().equals(keys.get(0))) {
                updatedTuples.add(tuple);
                continue;
            }

            Node valueNode = tuple.getValueNode();

            if (keys.size() == 1) {
                Tag tag = valueNode.getTag();
                Node newValueNode = null;

                if (isAnyInteger(newValue)) {
                    newValueNode =
                            new ScalarNode(Tag.INT, String.valueOf(newValue), ScalarStyle.PLAIN);
                } else if (isFloat(newValue)) {
                    Object floatValue = Float.valueOf(String.valueOf(newValue));
                    newValueNode =
                            new ScalarNode(
                                    Tag.FLOAT, String.valueOf(floatValue), ScalarStyle.PLAIN);
                } else if ("true".equals(newValue) || "false".equals(newValue)) {
                    newValueNode =
                            new ScalarNode(Tag.BOOL, String.valueOf(newValue), ScalarStyle.PLAIN);
                } else if (newValue instanceof List<?> list) {
                    List<Node> sequenceNodes = new ArrayList<>();
                    for (Object item : list) {
                        Object obj = String.valueOf(item);
                        if (isAnyInteger(item)) {
                            tag = Tag.INT;
                        } else if (isFloat(item)) {
                            obj = Float.valueOf(String.valueOf(item));
                            tag = Tag.FLOAT;
                        } else if ("true".equals(item) || "false".equals(item)) {
                            tag = Tag.BOOL;
                        } else if (item == null || "null".equals(item)) {
                            tag = Tag.NULL;
                        } else {
                            tag = Tag.STR;
                        }
                        sequenceNodes.add(
                                new ScalarNode(tag, String.valueOf(obj), ScalarStyle.PLAIN));
                    }
                    newValueNode = new SequenceNode(Tag.SEQ, sequenceNodes, FlowStyle.FLOW);
                } else if (tag == Tag.NULL) {
                    if ("true".equals(newValue)
                            || "false".equals(newValue)
                            || newValue instanceof Boolean) {
                        tag = Tag.BOOL;
                    }
                    newValueNode = new ScalarNode(tag, String.valueOf(newValue), ScalarStyle.PLAIN);
                } else {
                    newValueNode = new ScalarNode(tag, String.valueOf(newValue), ScalarStyle.PLAIN);
                }
                copyComments(valueNode, newValueNode);

                updatedTuples.add(new NodeTuple(keyNode, newValueNode));
                updated = true;
            } else if (valueNode instanceof MappingNode) {
                updated = updateValue(valueNode, keys.subList(1, keys.size()), newValue);
                updatedTuples.add(tuple);
            }
        }

        if (updated) {
            mappingNode.getValue().clear();
            mappingNode.getValue().addAll(updatedTuples);
        }
        setNewNode(node);

        return updated;
    }

    /**
     * Fetches a value based on an exact key path.
     *
     * @param keys The key hierarchy leading to the value.
     * @return The value if found, otherwise null.
     */
    public Object getValueByExactKeyPath(String... keys) {
        return getValueByExactKeyPath(getRootNode(), new ArrayDeque<>(List.of(keys)));
    }

    private Object getValueByExactKeyPath(Node node, Deque<String> keyQueue) {
        if (!(node instanceof MappingNode mappingNode)) return null;

        String currentKey = keyQueue.poll();
        if (currentKey == null) return null;

        for (NodeTuple tuple : mappingNode.getValue()) {
            if (tuple.getKeyNode() instanceof ScalarNode keyNode
                    && keyNode.getValue().equals(currentKey)) {
                if (keyQueue.isEmpty()) {
                    Node valueNode = tuple.getValueNode();

                    if (valueNode instanceof ScalarNode scalarValueNode) {
                        return scalarValueNode.getValue();
                    } else if (valueNode instanceof MappingNode subMapping) {
                        return getValueByExactKeyPath(subMapping, keyQueue);
                    } else if (valueNode instanceof SequenceNode sequenceNode) {
                        List<Object> valuesList = new ArrayList<>();
                        for (Node o : sequenceNode.getValue()) {
                            if (o instanceof ScalarNode scalarValue) {
                                valuesList.add(scalarValue.getValue());
                            }
                        }
                        return valuesList;
                    } else {
                        return null;
                    }
                }
                return getValueByExactKeyPath(tuple.getValueNode(), keyQueue);
            }
        }
        return null;
    }

    private Set<String> cachedKeys;

    /**
     * Retrieves the set of all keys present in the YAML structure. Keys are returned as
     * dot-separated paths for nested keys.
     *
     * @return A set containing all keys in dot notation.
     */
    public Set<String> getAllKeys() {
        if (cachedKeys == null) {
            cachedKeys = getAllKeys(getRootNode());
        }
        return cachedKeys;
    }

    /**
     * Collects all keys from the YAML node recursively.
     *
     * @param node The current YAML node.
     * @param currentPath The accumulated path of keys.
     * @param allKeys The set storing all collected keys.
     */
    private Set<String> getAllKeys(Node node) {
        Set<String> allKeys = new LinkedHashSet<>();
        collectKeys(node, "", allKeys);
        return allKeys;
    }

    /**
     * Recursively traverses the YAML structure to collect all keys.
     *
     * @param node The current node in the YAML structure.
     * @param currentPath The accumulated key path.
     * @param allKeys The set storing collected keys.
     */
    private void collectKeys(Node node, String currentPath, Set<String> allKeys) {
        if (node instanceof MappingNode mappingNode) {
            for (NodeTuple tuple : mappingNode.getValue()) {
                if (tuple.getKeyNode() instanceof ScalarNode keyNode) {
                    String newPath =
                            currentPath.isEmpty()
                                    ? keyNode.getValue()
                                    : currentPath + "." + keyNode.getValue();
                    allKeys.add(newPath);
                    collectKeys(tuple.getValueNode(), newPath, allKeys);
                }
            }
        }
    }

    /**
     * Retrieves the root node of the YAML document. If a new node was previously set, it is
     * returned instead.
     *
     * @return The root node of the YAML structure.
     */
    private Node getRootNode() {
        if (this.updatedRootNode != null) {
            return this.updatedRootNode;
        }
        Composer composer = new Composer(loadSettings, getParserImpl());
        Optional<Node> rootNodeOpt = composer.getSingleNode();
        if (rootNodeOpt.isPresent()) {
            return rootNodeOpt.get();
        }
        return null;
    }

    /**
     * Sets a new root node, allowing modifications to be tracked.
     *
     * @param newRootNode The modified root node.
     */
    public void setNewNode(Node newRootNode) {
        this.updatedRootNode = newRootNode;
    }

    /**
     * Retrieves the current root node (either the original or the updated one).
     *
     * @return The root node.
     */
    public Node getUpdatedRootNode() {
        if (this.updatedRootNode == null) {
            this.updatedRootNode = getRootNode();
        }
        return this.updatedRootNode;
    }

    /**
     * Initializes the YAML parser.
     *
     * @return The configured parser.
     */
    private ParserImpl getParserImpl() {
        return new ParserImpl(loadSettings, getStreamReader());
    }

    /**
     * Creates a stream reader for the YAML content.
     *
     * @return The configured stream reader.
     */
    private StreamReader getStreamReader() {
        return new StreamReader(loadSettings, yamlContent);
    }

    public MappingNode save(Path saveFilePath) throws IOException {
        if (!saveFilePath.equals(originalFilePath)) {
            Files.writeString(saveFilePath, convertNodeToYaml(getUpdatedRootNode()));
        }
        return (MappingNode) getUpdatedRootNode();
    }

    public void saveOverride(Path saveFilePath) throws IOException {
        Files.writeString(saveFilePath, convertNodeToYaml(getUpdatedRootNode()));
    }

    /**
     * Converts a YAML node back to a YAML-formatted string.
     *
     * @param rootNode The root node to be converted.
     * @return A YAML-formatted string.
     */
    public String convertNodeToYaml(Node rootNode) {
        StringWriter writer = new StringWriter();
        StreamDataWriter streamDataWriter =
                new StreamDataWriter() {
                    @Override
                    public void write(String str) {
                        writer.write(str);
                    }

                    @Override
                    public void write(String str, int off, int len) {
                        writer.write(str, off, len);
                    }
                };

        new Dump(DUMP_SETTINGS).dumpNode(rootNode, streamDataWriter);
        return writer.toString();
    }

    private static boolean isParsable(String value, Function<String, ?> parser) {
        try {
            parser.apply(value);
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /**
     * Checks if a given object is an integer.
     *
     * @param object The object to check.
     * @return True if the object represents an integer, false otherwise.
     */
    @SuppressWarnings("UnnecessaryTemporaryOnConversionFromString")
    public static boolean isInteger(Object object) {
        if (object instanceof Integer
                || object instanceof Short
                || object instanceof Byte
                || object instanceof Long) {
            return true;
        }
        if (object instanceof String str) {
            return isParsable(str, Integer::parseInt);
        }
        return false;
    }

    /**
     * Checks if a given object is a floating-point number.
     *
     * @param object The object to check.
     * @return True if the object represents a float, false otherwise.
     */
    @SuppressWarnings("UnnecessaryTemporaryOnConversionFromString")
    public static boolean isFloat(Object object) {
        return (object instanceof Float || object instanceof Double)
                || (object instanceof String str && isParsable(str, Float::parseFloat));
    }

    /**
     * Checks if a given object is a short integer.
     *
     * @param object The object to check.
     * @return True if the object represents a short integer, false otherwise.
     */
    @SuppressWarnings("UnnecessaryTemporaryOnConversionFromString")
    public static boolean isShort(Object object) {
        return (object instanceof Long)
                || (object instanceof String str && isParsable(str, Short::parseShort));
    }

    /**
     * Checks if a given object is a byte.
     *
     * @param object The object to check.
     * @return True if the object represents a byte, false otherwise.
     */
    @SuppressWarnings("UnnecessaryTemporaryOnConversionFromString")
    public static boolean isByte(Object object) {
        return (object instanceof Long)
                || (object instanceof String str && isParsable(str, Byte::parseByte));
    }

    /**
     * Checks if a given object is a long integer.
     *
     * @param object The object to check.
     * @return True if the object represents a long integer, false otherwise.
     */
    @SuppressWarnings("UnnecessaryTemporaryOnConversionFromString")
    public static boolean isLong(Object object) {
        return (object instanceof Long)
                || (object instanceof String str && isParsable(str, Long::parseLong));
    }

    /**
     * Determines if an object is any type of integer (short, byte, long, or int).
     *
     * @param object The object to check.
     * @return True if the object represents an integer type, false otherwise.
     */
    public static boolean isAnyInteger(Object object) {
        return isInteger(object) || isShort(object) || isByte(object) || isLong(object);
    }

    /**
     * Copies comments from an old node to a new one.
     *
     * @param oldNode The original node with comments.
     * @param newValueNode The new node to which comments should be copied.
     */
    private void copyComments(Node oldNode, Node newValueNode) {
        if (oldNode == null || newValueNode == null) return;
        if (oldNode.getBlockComments() != null) {
            newValueNode.setBlockComments(oldNode.getBlockComments());
        }
        if (oldNode.getInLineComments() != null) {
            newValueNode.setInLineComments(oldNode.getInLineComments());
        }
        if (oldNode.getEndComments() != null) {
            newValueNode.setEndComments(oldNode.getEndComments());
        }
    }
}
