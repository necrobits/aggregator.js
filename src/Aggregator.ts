import _ from "lodash";
import { AggregationConfiguration, AggregationMode, EntitySource, SingleAggregationOpts, SingleEnrichmentConfig } from "./types";

/**
 * Aggregator is a class that can be used to aggregate data from multiple sources.
 * 
 * The aggregator is responsible for coordinating the aggregation process 
 *  and injecting the data from the entity sources to the input.
 * 
 * An entity source must be firstly registered to the aggregator with a name using the register() method.
 * Then that name can be used to identify the source in the AggregationConfiguration.
 */
export class Aggregator<TSourceKey extends string = string> {
    private sources: Map<TSourceKey, EntitySource> = new Map();

    constructor(sources?: Record<TSourceKey, EntitySource>) {
        if (sources) {
            for (const sourceName in sources) {
                this.register(sourceName, sources[sourceName]);
            }
        }
    }

    /**
     * Register an entity source to the aggregator.
     * 
     * @param name The name of the entity source
     * @param source The entity source instance that implements the EntitySource interface
     * @returns 
     */
    public register(name: TSourceKey, source: EntitySource): this {
        this.sources.set(name, source);
        return this;
    }

    /**
     * Start the aggregation process and return the aggregated data.
     * Note that the data is not copied, so you should not expect the data to be the same after the aggregation.
     * 
     * @param data The data to enrich/aggregate
     * @param options The configuation for the aggregation.
     * @returns The data with the enrichments.
     */
    public async aggregate<TInput>(data: TInput | null, options: AggregationConfiguration<TSourceKey>): Promise<any> {
        if (!data) {
            return null;
        }
        // Extract entity sources to be used from options
        const entitySourceNames = _.uniq(_.map(options, (value) => value.source));

        // Collect all ids to be gathered and populated
        // The paths are sorted by length, so that the shortest paths are processed first
        const sourceToIds = new Map<TSourceKey, string[]>();
        const pathToEnrichmentConfigMap: { [path: string]: SingleEnrichmentConfig<TSourceKey>[] } = {};

        const sortedPaths = _.sortBy(Object.keys(options), (path) => path.split(".").length);

        // Scan through all the options and the data to find the IDs to be gathered
        for (const path of sortedPaths) {
            const pathOption = options[path];
            const sourceName = pathOption.source;
            let realPath = path;
            // Ignore the first '*.'
            if (realPath.startsWith("*.")) {
                realPath = realPath.substring(2);
            }

            // Collect the IDs to be gathered and add them to the existing IDs list
            const existingIds = _.get(sourceToIds, sourceName, []);
            const collectedPathDescriptors = collectPathsAndValues(data, realPath);
            const collectedIds = _.uniq(_.map(collectedPathDescriptors, "value"));
            sourceToIds.set(sourceName, _.uniq([...existingIds, ...collectedIds]));

            // Define the replacement and its path in the data,
            //  so that it can be replaced later
            for (const pathDescriptor of collectedPathDescriptors) {
                let concretePath = _.dropRight(pathDescriptor.path.split(".")).join(".");
                const enrichmentConfig = {
                    id: pathDescriptor.value,
                    objectAbsent: pathDescriptor.objectAbsent,
                    idKeyPath: pathDescriptor.path,
                    ...pathOption,
                }
                const existingConfigs = pathToEnrichmentConfigMap[concretePath] || [];
                existingConfigs.push(enrichmentConfig);
                pathToEnrichmentConfigMap[concretePath] = existingConfigs;
            }
        }

        // Initiate the preparation process. This will make sure that the data is ready to be used.
        // All the entity sources should be prepared before the aggregation process.
        const preparePromises: Promise<any>[] = [];
        for (const sourceName of entitySourceNames) {
            if (!this.sources.has(sourceName)) {
                throw new Error(`Entity source ${sourceName} is not registered.`);
            }
            const ids = sourceToIds.get(sourceName) || [];
            if (ids.length === 0) {
                continue;
            }
            const promise = this.sources.get(sourceName)!.prepare(ids);
            preparePromises.push(promise);
        }
        await Promise.all(preparePromises);

        // Enrich the data
        // Iterate over the paths and inject the enrichments to the desired place
        for (const path of _.keys(pathToEnrichmentConfigMap)) {
            const enrichmentConfigs = pathToEnrichmentConfigMap[path];
            for (const enrichmentConfig of enrichmentConfigs) {
                const { id,
                    source: sourceName,
                    removeIdKey: removeKey,
                    idKeyPath: idKey,
                    objectAbsent,
                    transform } = enrichmentConfig;
                if (objectAbsent) {
                    continue;
                }
                const mode = getModeFromConfig(enrichmentConfig);
                let enrichmentData = await this.sources.get(sourceName)!.get(id);
                // Transform the data if the transform function is provided
                if (transform && _.isFunction(transform)) {
                    enrichmentData = transform(enrichmentData);
                }
                if (mode === AggregationMode.MERGE) {
                    if (path.length > 0) {
                        let finalReplacement = enrichmentData ? _.merge(_.get(data, path), enrichmentData) : _.get(data, path);
                        _.set(data as any, path, finalReplacement);
                    } else {
                        data = enrichmentData ? _.merge(data, enrichmentData) : data;
                    }
                } else if (mode === AggregationMode.TO_KEY) {
                    const targetKey = enrichmentConfig.to!.key;
                    const omitNull = enrichmentConfig.to!.omitNull;
                    const targetPath = joinPath(path, targetKey);
                    // Transform all nullish to null;
                    const finalReplacement = enrichmentData || null;
                    _.set(data as any, joinPath(path, targetKey), enrichmentData || null);
                    if (omitNull && finalReplacement === null) {
                        _.unset(data as any, targetPath);
                    }
                }

                if (removeKey && idKey) {
                    _.unset(data, idKey);
                }
            }
        }
        return data;
    }
}


type PathDescriptor = { path: string; value: string; objectAbsent?: boolean };

function collectPathsAndValues(obj: any, path: string): PathDescriptor[] {
    let collectedPaths = _collectPathsAndValues(obj, path);
    if (!_.isArray(collectedPaths)) {
        collectedPaths = [collectedPaths];
    }
    return _.flattenDeep(collectedPaths);
}

function _collectPathsAndValues(obj: any, path: string, cumulatedPath: string = "") {
    if (_.isArray(obj)) {
        return obj.map((o, index) => _collectPathsAndValues(o, path, `${cumulatedPath}[${index}]`));
    }
    let currentKey = path.split(".")[0];
    let restPath = path.substring(currentKey.length + 1);
    if (currentKey === "*") {
        return _collectPathsAndValues(obj, restPath, cumulatedPath);
    }
    const pathToCurrentKey = joinPath(cumulatedPath, currentKey);
    const objValue = _.get(obj, currentKey);
    if (restPath.length === 0) {
        return {
            path: pathToCurrentKey,
            value: objValue,
            objectAbsent: !obj,
        };

    }
    return _collectPathsAndValues(objValue, restPath, pathToCurrentKey);
}

function joinPath(base: string, key: string): string {
    if (base.length === 0) {
        return key;
    }
    return `${base}.${key}`;
}

function getModeFromConfig(opts: SingleAggregationOpts): AggregationMode {
    if (opts.to) {
        return AggregationMode.TO_KEY;
    }
    return AggregationMode.MERGE;
}