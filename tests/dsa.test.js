const test = require('node:test');
const assert = require('node:assert/strict');
const {
  Queue,
  Stack,
  selectionSort,
  insertionSort,
  bubbleSort,
  indexSongsById,
  undoQueueAction,
} = require('../dsa');
const { uniqueApiSongs, uniqueGenres } = require('../client/src/dsa.mjs');

const sortingAlgorithms = [
  ['Selection Sort', selectionSort],
  ['Insertion Sort', insertionSort],
  ['Bubble Sort', bubbleSort],
];

function song(id, duration, extra = {}) {
  return { id, title: `track-${id}`, duration, ...extra };
}

for (const [name, sort] of sortingAlgorithms) {
  test(`${name} handles empty, single, duplicate-duration, and ordinary inputs without mutating them`, () => {
    for (const input of [[], [song('only', 100)]]) {
      const original = [...input];
      const result = sort(input);
      assert.deepEqual(result, input);
      assert.notStrictEqual(result, input);
      assert.deepEqual(input, original);
    }

    const input = [
      song('short', 100),
      song('equal-first', 400),
      song('long', 900),
      song('equal-second', 400),
      song('missing-duration', undefined),
    ];
    const original = [...input];
    const result = sort(input);
    assert.deepEqual(result.map(item => item.duration || 0), [900, 400, 400, 100, 0]);
    assert.equal(result.length, input.length);
    assert.equal(new Set(result).size, input.length);
    for (const item of input) assert.equal(result.includes(item), true);
    assert.deepEqual(input, original);
  });
}

test('Insertion Sort and Bubble Sort preserve the order of equal durations', () => {
  const input = [song('a', 2), song('b', 2), song('c', 2)];
  assert.deepEqual(insertionSort(input).map(item => item.id), ['a', 'b', 'c']);
  assert.deepEqual(bubbleSort(input).map(item => item.id), ['a', 'b', 'c']);
});

test('Queue preserves FIFO order, supports duplicate entries, and reports empty state', () => {
  const queue = new Queue();
  assert.equal(queue.isEmpty(), true);
  assert.equal(queue.size(), 0);
  assert.equal(queue.peek(), undefined);
  assert.equal(queue.dequeue(), undefined);

  queue.enqueue('first');
  queue.enqueue('second');
  queue.enqueue('first');
  assert.equal(queue.peek(), 'first');
  assert.equal(queue.size(), 3);
  assert.equal(queue.dequeue(), 'first');
  assert.equal(queue.dequeue(), 'second');
  assert.equal(queue.dequeue(), 'first');
  assert.equal(queue.isEmpty(), true);
});

test('Queue remove, clear, and restore preserve the remaining order', () => {
  const queue = new Queue();
  queue.restore(['a', 'b', 'c', 'b']);
  assert.equal(queue.removeAt(3), 'b');
  assert.equal(queue.removeAt(9), null);
  assert.deepEqual(queue.items, ['a', 'b', 'c']);
  assert.deepEqual(queue.clear(), ['a', 'b', 'c']);
  assert.equal(queue.isEmpty(), true);
  queue.restore(['a', 'b', 'c']);
  assert.deepEqual(queue.items, ['a', 'b', 'c']);
});

test('Stack is LIFO and display returns newest-first without mutating the stack', () => {
  const stack = new Stack();
  assert.equal(stack.isEmpty(), true);
  assert.equal(stack.size(), 0);
  assert.equal(stack.peek(), undefined);
  assert.equal(stack.pop(), undefined);
  stack.push('first');
  stack.push('second');
  stack.push('third');
  assert.equal(stack.peek(), 'third');
  assert.equal(stack.size(), 3);
  assert.deepEqual(stack.display(), ['third', 'second', 'first']);
  assert.equal(stack.pop(), 'third');
  assert.equal(stack.pop(), 'second');
  assert.equal(stack.pop(), 'first');
  assert.equal(stack.isEmpty(), true);
});

test('Undo reverses ADD, WATCH, REMOVE, and CLEAR and safely rejects invalid actions', () => {
  const queue = new Queue();
  queue.restore(['a', 'b']);
  assert.equal(undoQueueAction(queue, { action: 'REMOVE', song: 'x', index: 1 }), true);
  assert.deepEqual(queue.items, ['a', 'x', 'b']);
  assert.equal(undoQueueAction(queue, { action: 'WATCH', song: 'first' }), true);
  assert.deepEqual(queue.items, ['first', 'a', 'x', 'b']);
  assert.equal(undoQueueAction(queue, { action: 'ADD', index: 2 }), true);
  assert.deepEqual(queue.items, ['first', 'a', 'b']);
  assert.equal(undoQueueAction(queue, { action: 'CLEAR', songs: ['a', 'b'] }), true);
  assert.deepEqual(queue.items, ['a', 'b']);
  assert.equal(undoQueueAction(queue, { action: 'ADD', index: 9 }), false);
  assert.equal(undoQueueAction(queue, { action: 'OTHER' }), false);
  assert.equal(undoQueueAction(queue, null), false);
});

test('Map indexes songs by normalized ID and replaces duplicate keys with the latest value', () => {
  const map = indexSongsById(new Map(), [
    song(12, 100),
    song('12', 200),
    song(null, 300),
    song(undefined, 400),
  ]);
  assert.equal(map.size, 1);
  assert.equal(map.get('12').duration, 200);
});

test('Map deduplication retains the first API result and excludes items without real IDs', () => {
  const first = { apiId: 12, title: 'first' };
  const songs = uniqueApiSongs([
    first,
    { apiId: '12', title: 'duplicate' },
    { apiId: null, title: 'no API ID' },
    { title: 'missing API ID' },
  ]);
  assert.deepEqual(songs, [first]);
});

test('Set returns each supported genre once in display order', () => {
  assert.deepEqual(uniqueGenres([
    { apiGenre: 'Pop' },
    { apiGenre: 'Rock' },
    { apiGenre: 'Pop' },
    { apiGenre: '' },
    { apiGenre: null },
  ]), ['Pop', 'Rock']);
});
