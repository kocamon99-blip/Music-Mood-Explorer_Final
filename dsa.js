class Queue {
  constructor() { this.items = []; }
  enqueue(item) { this.items.push(item); }
  dequeue() { return this.items.shift(); }
  removeAt(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return null;
    return this.items.splice(index, 1)[0];
  }
  clear() { return this.items.splice(0); }
  restore(items) { this.items = [...items]; }
  peek() { return this.items[0]; }
  size() { return this.items.length; }
  isEmpty() { return this.items.length === 0; }
}

class Stack {
  constructor() { this.items = []; }
  push(item) { this.items.push(item); }
  pop() { return this.items.pop(); }
  peek() { return this.items[this.items.length - 1]; }
  size() { return this.items.length; }
  isEmpty() { return this.items.length === 0; }
  display() { return [...this.items].reverse(); }
}

function selectionSort(items) {
  const sorted = [...items];
  for (let i = 0; i < sorted.length - 1; i++) {
    let maxIndex = i;
    for (let j = i + 1; j < sorted.length; j++) {
      if ((sorted[j].duration || 0) > (sorted[maxIndex].duration || 0)) maxIndex = j;
    }
    [sorted[i], sorted[maxIndex]] = [sorted[maxIndex], sorted[i]];
  }
  return sorted;
}

function insertionSort(items) {
  const sorted = [...items];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    let j = i - 1;
    while (j >= 0 && (sorted[j].duration || 0) < (current.duration || 0)) {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = current;
  }
  return sorted;
}

function bubbleSort(items) {
  const sorted = [...items];
  for (let i = 0; i < sorted.length - 1; i++) {
    let swapped = false;
    for (let j = 0; j < sorted.length - 1 - i; j++) {
      if ((sorted[j].duration || 0) < (sorted[j + 1].duration || 0)) {
        [sorted[j], sorted[j + 1]] = [sorted[j + 1], sorted[j]];
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return sorted;
}

function indexSongsById(songMap, songs) {
  for (const song of songs) {
    if (song.id !== null && song.id !== undefined) songMap.set(String(song.id), song);
  }
  return songMap;
}

function undoQueueAction(queue, action) {
  if (!action) return false;
  if (action.action === 'ADD') return queue.removeAt(action.index) !== null;
  if (action.action === 'WATCH') {
    queue.items.unshift(action.song);
    return true;
  }
  if (action.action === 'REMOVE') {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index > queue.size()) return false;
    queue.items.splice(action.index, 0, action.song);
    return true;
  }
  if (action.action === 'CLEAR' && Array.isArray(action.songs)) {
    queue.restore(action.songs);
    return true;
  }
  return false;
}

module.exports = {
  Queue,
  Stack,
  selectionSort,
  insertionSort,
  bubbleSort,
  indexSongsById,
  undoQueueAction,
};
