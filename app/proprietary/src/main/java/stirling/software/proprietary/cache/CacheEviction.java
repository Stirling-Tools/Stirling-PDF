package stirling.software.proprietary.cache;

/**
 * One second-level cache entry, or set of entries, to drop. Crosses the wire between nodes, so
 * every field is a string: {@code role} is a Hibernate entity name or collection role, and {@code
 * key} is the identifier, owner identifier or natural id rendered by the matching Hibernate {@code
 * JavaType}.
 */
public record CacheEviction(Kind kind, String role, String key) {

    public enum Kind {
        ENTITY,
        /** The entity plus every cached collection it owns, for writes Java did not see. */
        ENTITY_WITH_COLLECTIONS,
        COLLECTION,
        NATURAL_ID,
        /** Every entry of the entity, its natural ids and its collections. */
        ENTITY_REGION,
        ALL
    }

    public static CacheEviction entity(String entityName, String id) {
        return new CacheEviction(Kind.ENTITY, entityName, id);
    }

    public static CacheEviction entityWithCollections(String entityName, String id) {
        return new CacheEviction(Kind.ENTITY_WITH_COLLECTIONS, entityName, id);
    }

    public static CacheEviction collection(String role, String ownerId) {
        return new CacheEviction(Kind.COLLECTION, role, ownerId);
    }

    public static CacheEviction naturalId(String entityName, String naturalId) {
        return new CacheEviction(Kind.NATURAL_ID, entityName, naturalId);
    }

    public static CacheEviction entityRegion(String entityName) {
        return new CacheEviction(Kind.ENTITY_REGION, entityName, null);
    }

    public static CacheEviction all() {
        return new CacheEviction(Kind.ALL, null, null);
    }
}
