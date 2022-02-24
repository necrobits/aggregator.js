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

const opts = {
    'tasks.*.assigneeId': {
        mode: 'toKey',
        toKey: 'assignee'
    },
    'tasks.*.taskId': {
        mode: 'merge',
        removeIdKey: true
    }
}
const aggregated = await aggregator.aggregate(data, opts);

console.log(data)
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

## Using cache
You can implement an adapter that implements the `EntityCache` interface to use cache in `CachedEntitySource`.

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

## License
MIT