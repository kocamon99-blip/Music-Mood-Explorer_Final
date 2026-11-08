const { performance } = require('node:perf_hooks');
const { selectionSort, insertionSort, bubbleSort } = require('../dsa');

const algorithms = [
  ['Selection Sort', selectionSort],
  ['Insertion Sort', insertionSort],
  ['Bubble Sort', bubbleSort],
];
const dataset = Array.from({ length: 500 }, (_, index) => ({
  duration: (index * 7919) % 5000,
}));
const rounds = 30;

for (const [, sort] of algorithms) {
  for (let warmup = 0; warmup < 5; warmup++) sort(dataset);
}

for (const [name, sort] of algorithms) {
  const start = performance.now();
  let checksum = 0;
  for (let round = 0; round < rounds; round++) {
    checksum += sort(dataset)[0]?.duration || 0;
  }
  const elapsedMs = performance.now() - start;
  console.log(`${name}: ${elapsedMs.toFixed(3)} ms total, ${(elapsedMs / rounds).toFixed(3)} ms/run (${rounds} runs; ${dataset.length} items; checksum ${checksum})`);
}
