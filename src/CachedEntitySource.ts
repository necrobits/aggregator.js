import { EntitySource, EntityLookupFunction, EntityIdGetter as EntityIdGetter } from "./types";

export interface EntityCache<T = any> {
    /**
     * Get the cached object for the given key
     * @param key The key to look up
     */
    get(key: string): Promise<T>;

    /**
     * Put multiple objects to the cache.
     * @param batch The key-value pairs of the key and object to put to the cache.
     */
    setBatch(batch: { key: string; value: T }[]): Promise<void>;

    /**
     * Invalidate the cache when mutations happen.
     * @param keys to invalidate
     */
    invalidate(keys: string[]): Promise<void>
}

export type CachedEntitySourceOpts<T = any, TResult = T> = {
    /**
     * The cache instance.
     */
    cache: EntityCache<TResult>;

    /**
     * The function get the entities using their IDs. Usually this is a query to the database, or a call to a service.
     */
    lookupUsing: EntityLookupFunction<T>;

    /**
     * They field name for the ID of the entity.
     * Or a function get the ID of the entity.
     */
    entityIdBy: EntityIdGetter<T>;

    /**
     * Transform the entity before storing it in the cache.
     */
    transform?: (data: T) => TResult;

    /**
     * The prefix to use for the cache key. This is used to avoid collisions with other kinds of cache.
     */
    cacheKeyPrefix?: string;

    /**
     * The function to determine the cache key for the given entity.
     * If not provided, the default cache key function is used:
     * `$<cacheKeyPrefix>::<aggregatorName>::<aggregatorId>::<entityId>`.
     * If this function is provided, the cacheKeyPrefix will have no effect, since this function is used to generate the cache key.
     */
    cacheKeyUsing?: (id: string) => string;

    /**
     * The ID of the aggregator. This is useful when you have multiple aggregators of the same type (or name) accessing to the same cache section.
     */
    aggregatorId?: string;
};

/**
 * An implementation of the EntitySource interface that uses a cache to store the entities.
 * The cache can be invalidated when the entities change.
 * 
 * The cache instance must implement the EntityCache interface,
 *  so you can implement an Adapter for any kind of cache you prefer to use.
 */
export class CachedEntitySource<T, TResult = T> implements EntitySource<T, TResult> {
    private cache: EntityCache<TResult>;
    private name: string;
    private lookupFunc: EntityLookupFunction<T>;
    private lookupIdGetter: EntityIdGetter<T>;
    private uniqueId: string;
    private cacheKeyPrefix: string;
    private cacheKeyUsing: (id: string) => string;
    private transform: (element: T) => TResult;

    constructor(name: string, opts: CachedEntitySourceOpts<T, TResult>) {
        this.name = name;
        this.lookupFunc = opts.lookupUsing;
        this.lookupIdGetter = opts.entityIdBy;
        this.cache = opts.cache;
        this.uniqueId = opts.aggregatorId ?? (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
        this.cacheKeyPrefix = opts.cacheKeyPrefix ?? "aggcache";

        // Only modify when you know what you are doing, otherwise things will get 
        this.cacheKeyUsing = opts.cacheKeyUsing ?? ((id: string) => this.defaultCacheKey(id));
        this.transform = opts.transform ?? ((element: T) => element as unknown as TResult);
    }

    async prepare(ids: string[]): Promise<void> {
        const data = await this.lookupFunc(ids);
        await this.cache.setBatch(
            data.map((d) => ({
                key: this.cacheKeyUsing(this.getElementId(d)),
                value: this.transform(d),
            }))
        );
    }

    async get(id: string): Promise<TResult> {
        const entityFromCache = await this.cache.get(this.cacheKeyUsing(id));
        return entityFromCache;
    }

    async invalidate(ids: string[]): Promise<void> {
        await this.cache.invalidate(ids.map((id) => this.cacheKeyUsing(id)));
    }

    private defaultCacheKey(id: string): string {
        return `$${this.cacheKeyPrefix}::${this.name}::${this.uniqueId}::${id}`;
    }

    private getElementId(element: T): string {
        if (typeof this.lookupIdGetter === "string") {
            return `${element[this.lookupIdGetter]}`;
        } else {
            return this.lookupIdGetter(element);
        }
    }
}
