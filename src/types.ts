export interface EntitySource<T = any, TResult = T> {
    prepare(ids: string[]): Promise<void>;
    get(id: string): Promise<TResult>;
}

export enum AggregationMode {
    MERGE = "merge",
    TO_KEY = "toKey",
}
export type EntityIdGetter<T> = (string & keyof T) | ((element: T) => string);

export type EntityLookupFunction<T = any> = (keys: string[]) => Promise<T[]> | T[];

export type AggregationConfiguration = {
    [idPath: string]: SingleAggregationOpts;
};

export type ToKeyModeOpts = {
    key: string;
    omitNull?: boolean;
}

export type SingleAggregationOpts = {
    source: string;
    to?: ToKeyModeOpts;
    removeIdKey?: boolean;
    transform?: (element: any) => any;
};

export type SingleEnrichmentConfig = {
    id: string;
    idKeyPath: string;
} & SingleAggregationOpts;