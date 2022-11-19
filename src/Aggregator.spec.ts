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
const aggregator = new Aggregator({
    user: userSource,
    todo: todoSource,
});

beforeEach(() => {

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
            }
        }
        data = { assigneeId: 'A', taskId: 'T1' };
    })
    test('Happy path', async () => {
        const result = await aggregator.aggregate(data, opts);
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

    test('When having null ID in MERGE mode: nothing will be merged into the object', async () => {
        data.taskId = null;
        const result = await aggregator.aggregate(data, opts);
        expect(Object.keys(result)).not.toContain('task');
    });

    test('When having null ID in TO_KEY mode: the key should be null', async () => {
        data.assigneeId = null;
        const result = await aggregator.aggregate(data, opts);
        expect(Object.keys(result)).toContain('assignee');
        expect(result.assignee).toBeNull();
    });
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
    test('When having null ID in MERGE mode: should turn the target object to null', async () => {
        data[1].tasks[0].taskId = null;
        const result = await aggregator.aggregate(data, opts);
        expect(result[1].tasks[0]).toBeNull();
    });
    test('When having null ID in TO_KEY mode without "omitNull" option: should create the key with value null', async () => {
        data[0].tasks[0].assigneeId = null;
        const result = await aggregator.aggregate(data, opts);
        console.log(JSON.stringify(result, null, 2));
        expect(Object.keys(result[0].tasks[0])).toContain('assignee');
        expect(result[0].tasks[0].assignee).toBeNull();
    });
    test('When having null ID in TO_KEY mode with "omitNull" option: should not create the key', async () => {
        data[0].tasks[0].assigneeId = null;
        opts['tasks.*.assigneeId'].to.omitNull = true;
        const result = await aggregator.aggregate(data, opts);
        console.log(JSON.stringify(result[0].tasks[0], null, 2));
        expect(result).toHaveProperty('0.tasks.0.task', 'Study');
        expect(Object.keys(result[0].tasks[0])).not.toContain('assignee');
    })
});