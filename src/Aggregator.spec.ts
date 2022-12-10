import { Aggregator } from "./Aggregator";
import { SimpleEntitySource } from "./SimpleEntitySource";


const users = [
    { id: 'A', name: 'Andy' },
    { id: 'B', name: 'Hai' }
];
const findUsers = ids => users.filter(user => ids.includes(user.id));

const todos = [
    { id: 'T1', task: 'Study' },
    { id: 'T2', task: 'Code' }
];
const findTodos = ids => todos.filter(todo => ids.includes(todo.id));

const userSource = new SimpleEntitySource("user", {
    lookupUsing: findUsers,
    entityIdBy: "id"
});

const todoSource = new SimpleEntitySource("todo", {
    lookupUsing: findTodos,
    entityIdBy: "id"
})

enum Source {
    USER = 'user',
    TODO = 'todo'
}

const typedAggregator = new Aggregator<Source>({
    [Source.USER]: userSource,
    [Source.TODO]: todoSource
})

const aggregator = new Aggregator({
    user: userSource,
    todo: todoSource,
});

describe('Aggregate object', () => {
    let data: any;
    let opts: any;
    beforeEach(() => {
        opts = {
            "assigneeId": {
                source: "user",
                to: {
                    key: "assignee",
                },
                removeIdKey: true,
            },
            "taskId": {
                source: "todo",
                removeIdKey: true,
            },
            "childTaskId": {
                source: "todo",
                removeIdKey: true,
                to: {
                    key: "childTask",
                }
            }
        }
        data = { assigneeId: 'A', taskId: 'T1', childTaskId: 'T2' };
    })
    test('Happy path', async () => {
        const result = await aggregator.aggregate(data, opts);
        console.log(result);
        expect(result.task).toBe('Study');
        expect(result.assignee.id).toBe('A');
        expect(result.assignee.name).toBe('Andy');
        expect(result.childTask.task).toBe('Code');
        // Make sure the id key is removed
        expect(Object.keys(result)).not.toContain('assigneeId');
        expect(Object.keys(result)).not.toContain('taskId');
        expect(Object.keys(result)).not.toContain('childTaskId');
    });

    test('Enum as source key should work as usual', async () => {
        const typedOpts = {
            "assigneeId": {
                source: Source.USER,
                to: {
                    key: "assignee",
                },
                removeIdKey: true,
            },
            "taskId": {
                source: Source.TODO,
                removeIdKey: true,
            }
        }
        const result = await typedAggregator.aggregate(data, typedOpts);
        expect(result.task).toBe('Study');
        expect(result.assignee.id).toBe('A');
        expect(result.assignee.name).toBe('Andy');
        // Make sure the id key is removed
        expect(Object.keys(result)).not.toContain('assigneeId');
        expect(Object.keys(result)).not.toContain('taskId');
    });

    test('When removeIdKey is false: should not remove the id key', async () => {
        opts.assigneeId.removeIdKey = false;
        const result = await aggregator.aggregate(data, opts);
        expect(Object.keys(result)).toContain('assigneeId');
    })

    test('When having null ID in MERGE mode: nothing will be merged into the object, but other props must remain', async () => {
        data.taskId = null;
        data.otherProp1 = 'A';
        data.otherProp2 = 'B';
        const result = await aggregator.aggregate(data, opts);
        expect(Object.keys(result)).not.toContain('task');
        expect(Object.keys(result)).toContain('otherProp1');
        expect(Object.keys(result)).toContain('otherProp2');
        expect(result).toHaveProperty('assignee.name', 'Andy');
    });

    test('When having null ID in TO_KEY mode: the key should be null', async () => {
        data.assigneeId = null;
        const result = await aggregator.aggregate(data, opts);
        expect(Object.keys(result)).toContain('assignee');
        expect(result.assignee).toBeNull();
    });

    test('When data is null: should return null back', async () => {
        const result = await aggregator.aggregate(null, opts);
        expect(result).toBeNull();
    })

});

describe('Aggregating array', () => {
    let data: any[];
    let opts: any;
    beforeEach(async () => {
        opts = {
            'tasks.*.assigneeId': {
                source: 'user',
                to: {
                    key: 'assignee',
                },
                removeIdKey: true
            },
            'tasks.*.taskId': {
                source: 'todo',
                removeIdKey: true
            }
        }
        data = [
            {
                date: '22-02-2022',
                tasks: [
                    { assigneeId: 'A', taskId: 'T1' },
                ],
            },
            {
                date: '23-02-2022',
                tasks: [
                    { assigneeId: 'A', taskId: 'T1' },
                    { assigneeId: 'B', taskId: 'T2' },
                ]
            }
        ];
    })
    test('Happy path', async () => {
        const result = await aggregator.aggregate(data, opts);
        expect(result[0].tasks[0].id).toBe('T1');
        expect(result[0].tasks[0].assignee.id).toBe('A');
        expect(result[1].tasks[0].id).toBe('T1');
        expect(result[1].tasks[0].assignee.id).toBe('A');
        expect(result[1].tasks[1].id).toBe('T2');
        expect(result[1].tasks[1].assignee.id).toBe('B');
    });
    test('When having null ID in MERGE mode: nothing will be merged into the object, but other props must remain', async () => {
        data[1].tasks[0].taskId = null;
        const result = await aggregator.aggregate(data, opts);
        expect(Object.keys(result[1].tasks[0])).not.toContain('task');
        expect(Object.keys(result[1].tasks[0])).toContain('assignee');
    });
    test('When having null ID in TO_KEY mode without "omitNull" option: should create the key with value null', async () => {
        data[0].tasks[0].assigneeId = null;
        const result = await aggregator.aggregate(data, opts);
        expect(Object.keys(result[0].tasks[0])).toContain('assignee');
        expect(result[0].tasks[0].assignee).toBeNull();
    });
    test('When having null ID in TO_KEY mode with "omitNull" option: should not create the key', async () => {
        data[0].tasks[0].assigneeId = null;
        opts['tasks.*.assigneeId'].to.omitNull = true;
        const result = await aggregator.aggregate(data, opts);
        expect(result).toHaveProperty('0.tasks.0.task', 'Study');
        expect(Object.keys(result[0].tasks[0])).not.toContain('assignee');
    });

    test('When data containing null: should return null at those positions', async () => {
        data.push(null);
        data.push({ date: '24-02-2022', tasks: [null] });
        const result = await aggregator.aggregate(data, opts);
        expect(result[2]).toBeNull();
    })
});