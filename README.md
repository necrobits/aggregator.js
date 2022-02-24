# Aggregator.js
An flexible aggregator component for your backend (or even frontend).

An implementation for entity source with cache (`CachedEntitySource`) is also shipped in the library.

You can freely define how to gather your data by implementing your own lookup function. 

## Install
Using `npm`
```
npm install @necrobits/aggregator
```
or using `yarn`
```
yarn add @necrobits/aggregator
```

## Quick start
Given the following data and getters
```javascript
const users = [
    {id: 'A', name: 'Andy'},
    {id: 'B', name: 'Hai'}
];
const findUsers = ids => users.filter(id => ids.includes(id));

const todos = [
    {id: 'T1', task: 'Study'},
    {id: 'T2', task: 'Code'}
];
const findTodos = ids => todos.filter(id => ids.includes(id));

// You want aggregation for this data
const data = [
    {
        date: '22-02-2022',
        tasks: [
            {assigneeId: 'A', taskId: 'T1'}
            {assigneeId: 'B', taskId: 'T2'}
        ],
    },
// {...},
]
```
The code for the aggregation looks like this:
```javascript
const userSource = new SimpleEntitySource("user", {
    lookupUsing: findUsers,
    entityIdBy: "id"
});

const todoSource = new SimpleEntitySource("todo", {
    lookupUsing: findTodos,
    entityIdBy: "id"
})
const aggregator = new Aggregator({
    user: userSource,
    todo: todoSource,
});
// or 
const aggregator = new Aggregator();
aggregator
    .register("user", userSource)
    .register("todo", todoSource);
```
Use the aggregator
```javascript
const opts = {
    'tasks.*.assigneeId': {
        mode: 'toKey',
        toKey: 'assignee',
        removeIdKey: true
    },
    'tasks.*.taskId': {
        mode: 'merge',
        removeIdKey: true
    }
}
const aggregatedData = await aggregator.aggregate(data, opts);

console.log(aggregatedData)
```
Output:
```javascript
[{
    date: '22-02-2022',
    tasks: [
        { 
            id: 'T1',
            name: 'Study'
            assignee: { 
                id: 'A', 
                name: 'Andy'
            }
        },
        {
            id: 'T2',
            name: 'Code',
            assignee: {
                id: 'B',
                name: 'Hai'
            }
        }
    ]
},
{...}] 

```
## Syntax
The syntax to define a aggregation process is as follows:
```javascript
{
    "<path to the object's ID>": {
        //<Aggregation Options>
    }
}
```
While declare a path to the object's ID, sometimes you have to access to an array. You can simply use `*` to tell the aggregator to process every element in that array (see example above).

However, if the data itself is an array, you don't need to use the asterik `*` at the beginning. The aggregator can recognize that automatically. Meaning, don't write `*.userId` if you have an array of multiple objects that contains `userId`,
```javascript
[{'userId': '1'}, {'userId': '2'}]
```
you can simply use `userId` directly.
```javascript
{
    "userId":{
        // options
    } 
}
```
## Aggregation Options
| Name        | Type               | Description                                           | Required                  | Default                           |
|-------------|--------------------|-------------------------------------------------------|---------------------------|-----------------------------------|
| source      | string             | Name of the entity source to gather the data          | Yes                       |                                   |
| mode        | "merge" \| "toKey" | Specify how to inject the data                        | Yes                       |                                   |
| toKey       | string             | The name of the new field to inject the data into     | Only when mode is "toKey" |                                   |
| removeIdKey | boolean            | Remove the id field after injecting the data          | No                        | false                             |
| transform   | (any) => (any)     | A function to transform the data before the injection | No                        | Identity function<br><br>(v) => v |
## Using cache with CachedEntitySource
You can implement an adapter that implements the `EntityCache` interface to use cache in `CachedEntitySource`.

### Example
This is an example for `node-cache`. You can also use Typescript if you want to.
```typescript
export class NodeCacheAdapter<T> implements EntityCache<T> {
    constructor(private nodeCache: NodeCache) {}
    
    async invalidate(keys: string[]): Promise<void> {
        this.nodeCache.del(keys);
        return;
    }

    async get(key: string): Promise<T> {
        return this.nodeCache.get(key);
    }

    async setBatch(batch: { key: string; value: any }[]): Promise<void> {
        this.nodeCache.mset(
            batch.map((b) => ({
                key: b.key,
                val: b.value,
            }))
        );
    }
}
```

```typescript
const cache = new NodeCache();
const userSource = new CachedEntitySource<User>("user",{
    cache: new NodeCacheAdapter<User>(cache);
    lookupUsing: findUsers,
    entityIdBy: "id"
});
```

### CachedEntitySource Options
| Name        | Type                                                        | Description                                                                                          |
|-------------|-------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| cache       | EntityCache                                                 | The cache instance that implements the EntityCache interface                                         |
| lookupUsing | EntityLookupFunction<br>(string[]) => (T[] \| Promise<T[]>) | A function that receives an array of IDs and returns an array of entities<br>(or an Promise)         |
| entityIdBy  | string \| (T) => string                                     | The name of the ID field in the entity, or a function that receives an entity<br>and returns its ID. |

## License
MIT