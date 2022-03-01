
import { EntitySource, EntityLookupFunction, EntityIdGetter as EntityIdGetter } from "./types";

export type SimpleEntitySourceOpts<T = any, TResult = T> = {
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
};

/**
 * This is a dead simple implementation of the EntitySource interface that holds
 * the entities in memory.
 * 
 * This implementation is not suitable for production use. It is meant to be used
 * to provide a starting point for your own implementation, or for testing.
 */
export class SimpleEntitySource<T, TResult = T> implements EntitySource<T, TResult> {
    private name: string;
    private lookupFn: EntityLookupFunction<T>;
    private lookupIdGetter: EntityIdGetter<T>;
    private memory = new Map<string, TResult>();
    private transform: (element: T) => TResult;

    constructor(name: string, opts: SimpleEntitySourceOpts<T, TResult>) {
        this.name = name;
        this.lookupFn = opts.lookupUsing;
        this.lookupIdGetter = opts.entityIdBy;
        this.transform = opts.transform ?? ((element: T) => element as unknown as TResult);
    }

    async prepare(ids: string[]): Promise<void> {
        const data = await this.lookupFn(ids);
        for (const element of data) {
            const id = this.getElementId(element);
            this.memory.set(id, this.transform(element));
        }
    }

    async get(id: string): Promise<TResult> {
        const entityFromCache = await this.memory.get(id);
        return entityFromCache!;
    }

    private getElementId(element: T): string {
        if (typeof this.lookupIdGetter === "string") {
            return `${element[this.lookupIdGetter]}`;
        } else {
            return this.lookupIdGetter(element);
        }
    }
}
