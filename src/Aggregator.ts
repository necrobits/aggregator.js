import _ from "lodash";
import { AggregationConfiguration, EntitySource, SingleEnrichmentConfig } from "./types";

/**
 * Aggregator is a class that can be used to aggregate data from multiple sources.
 * 
 * The aggregator is responsible for coordinating the aggregation process 
 *  and injecting the data from the entity sources to the input.
 * 
 * An entity source must be firstly registered to the aggregator with a name using the register() method.
 * Then that name can be used to identify the source in the AggregationConfiguration.
 */
export class Aggregator {
    private sources: Map<string, EntitySource> = new Map();

    constructor(sources?: Record<string, EntitySource>) {
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
    public register(name: string, source: EntitySource): this {
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
    public async aggregate<TInput>(data: TInput, options: AggregationConfiguration): Promise<any> {
        // Extract entity sources to be used from options
        const entitySourceNames = _.uniq(_.map(options, (value) => value.source));

        // Collect all ids to be gathered and populated
        // The paths are sorted by length, so that the shortest paths are processed first
        const sourceToIdsMap = {};
        const pathToEnrichmentConfigMap: { [path: string]: SingleEnrichmentConfig[] } = {};

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
            const existingIds = _.get(sourceToIdsMap, sourceName, []);
            const collectedPathAndIds = collectPathsAndValues(data, realPath);
            const collectedIds = _.uniq(_.map(collectedPathAndIds, "value"));
            sourceToIdsMap[sourceName] = _.uniq(existingIds.concat(collectedIds));

            // Define the replacement and its path in the data,
            //  so that it can be replaced later
            for (const pathAndId of collectedPathAndIds) {
                const id = pathAndId.value;
                let concretePath = _.dropRight(pathAndId.path.split(".")).join(".");
                const enrichmentConfig = {
                    id,
                    idKeyPath: pathAndId.path,
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
            const ids = sourceToIdsMap[sourceName];
            if (!this.sources.has(sourceName)) {
                throw new Error(`Entity source ${sourceName} is not registered.`);
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
                const { id, mode, source: sourceName, removeIdKey: removeKey, idKeyPath: idKey, transform } = enrichmentConfig;
                let enrichmentData = await this.sources.get(sourceName)!.get(id);
                // Transform the data if the transform function is provided
                if (transform && _.isFunction(transform)) {
                    enrichmentData = transform(enrichmentData);
                }

                if (mode === "merge") {
                    if (path.length > 0) {
                        const finalReplacement = _.merge(_.get(data, path), enrichmentData);
                        _.set(data as any, path, finalReplacement);
                    } else {
                        // If path is empty, we are dealing with a single object
                        data = _.merge(data, enrichmentData);
                    }
                } else if (mode === "toKey") {
                    const targetKey = enrichmentConfig.toKey!;
                    _.set(data as any, joinPath(path, targetKey), enrichmentData);
                }

                if (removeKey && idKey) {
                    _.unset(data, idKey);
                }
            }
        }
        return data;
    }
}


type PathValuePair = { path: string; value: string };

function collectPathsAndValues(obj: any, path: string): PathValuePair[] {
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
    if (restPath.length === 0) {
        return {
            path: pathToCurrentKey,
            value: obj[currentKey],
        };
    }

    return _collectPathsAndValues(obj[currentKey], restPath, pathToCurrentKey);
}

function joinPath(base: string, key: string): string {
    if (base.length === 0) {
        return key;
    }
    return `${base}.${key}`;
}
