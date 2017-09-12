#!/bin/bash

# This script generates the data summarized in the Performance section.
# It is intended to be run as `bin/benchmark-all` from the artifact root directory.

set -e  # Exit if any single step fails

# 1. Run the edit benchmark, summarized in Figure 7 of the paper.
echo "Running benchmarks, this may take a while..."
cd bench
if [ "$1" != "--quick" ]; then
  echo "ES5-Standard takes the most time (~25 mins). Use --quick to skip it."
  node --expose_gc run-benchmark.js ohm-edit-script.js --standard -o results/standard.csv > /dev/null
fi
node --expose_gc run-benchmark.js ohm-edit-script.js --incremental -o results/incremental.csv > /dev/null
node --expose_gc run-benchmark.js ohm-edit-script.js --acorn -o results/acorn.csv  > /dev/null

# 2. Run the memory usage benchmark, summarized in Figure 8.
node --expose_gc run-benchmark.js --standard > results/standard-heap.txt
node --expose_gc run-benchmark.js --incremental > results/incremental-heap.txt
