package stirling.software.proprietary.cache;

public record CacheEviction(Kind kind, String role, String key) {

    public enum Kind {
        ENTITY,
        ENTITY_WITH_COLLECTIONS,
        COLLECTION,
        NATURAL_ID,
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
