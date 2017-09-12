#!/usr/bin/env node

'use strict';

var Command = require('commander').Command;
var ES5 = require('../src/es5');
var acorn = require('acorn');
var fs = require('fs');
var path = require('path');

var standard = require('../src/standard');
var incremental = require('../src/incremental');

var INC_REPORTING_PERIOD = 10;

// Helpers
// -------

var createMatcher = null;

function now() {
  var [seconds, nanos] = process.hrtime();
  return seconds * 1e3 + nanos / 1e6;
}

function getHeapUsed() {
  global.gc();
  global.gc();
  global.gc();
  return process.memoryUsage().heapUsed;
}

// Print a summary of the amount of heap memory used over `prevHeapUsed`, assuming that
// it is entirely due to the memo table.
function doMeasurement(matcher, prevHeapUsed, matchTime) {
  var heapUsed = getHeapUsed();
  var memoTableUsage = (heapUsed - prevHeapUsed) / 1000;
  var memoEntryCount = matcher.memoTable ? countMemoEntries(matcher.memoTable) : 0;
  var avgUsage = memoTableUsage / memoEntryCount * 1000;

  console.log(` | ${matchTime.toFixed(1)}ms, ${memoTableUsage.toFixed(3)}k (avg ${avgUsage.toFixed()} bytes/entry)`);
}

// Return the number of memo table entries (ruleName x pos).
function countMemoEntries(memoTable) {
  var count = 0;
  for (var i = 0; i < memoTable.length; ++i) {
    var col = memoTable[i];
    if (col) {
      var map = col.memo || col;
      count += Array.from(map.keys()).length;
    }
  }
  return count;
}

// Measure the memo table memory usage after parsing, and optionally editing, some ES5 source.
// This is intended to be used in one of two ways:
// - For batch (non-incremental) use, `initialInput` is some ES5 source code, and `optEditArr`
//   is not specified.
// - For incremental use, `initialInput` is an empty string, and `optEditArr` is an array of
//   edit operations. The memory usage will be measured and printed periodically (every n edits).
function measure(name, initialInput, optEditArr, optTimingFilename) {
  process.stdout.write(`  - ${name}`);
  var matcher = createMatcher(initialInput);
  var writeStream = optTimingFilename ? fs.createWriteStream(optTimingFilename) : process.stdout;

  var heapUsedBeforeMatching = getHeapUsed();

  var startTime = now();
  if (!matcher.match(initialInput)) {
    throw new Error('match failed');
  }
  var endTime = now();
  if (optEditArr) {
    var input = initialInput;
    for (var i = 0; i < optEditArr.length; i++) {
      var editOp = optEditArr[i];

      // In any case (standard, incremental, Acorn), charge the cost of splicing the input
      // string to the parser, because the operation is the same and all have to do it.

      startTime = now();  // Begin timing
      if (matcher.applyEdit) {
        matcher.applyEdit.apply(matcher, editOp);
        matcher.match();
      } else {
        input = input.slice(0, editOp[0]) + editOp[2] + input.slice(editOp[1]);
        matcher.match(input);
      }
      endTime = now();  // End timing
      writeStream.write((endTime - startTime).toFixed(2) + '\n');
    }
  } else {
    doMeasurement(matcher, heapUsedBeforeMatching, endTime - startTime);
  }
}

// Return the contents of the test data file named `filename`.
function dataFileContents(filename) {
  return fs.readFileSync(`${__dirname}/../test/data/${filename}`).toString();
}

// Main
// ----

// Set up the CLI and parse the arguments.
var exeName = path.basename(process.argv[1]);
var program = new Command(`node --expose-gc ${exeName}`)
  .usage('[options] [edit_script]')
  .option('--standard', 'Use standard recognizer')
  .option('--incremental', 'Use incremental recognizer (required for edit scripts)')
  .option('--nontransient', 'Enable the non-transient optimization for the incremental recognizer')
  .option('--acorn', 'Use Acorn')
  .option('-o, --out <filename>', 'Write timing results to <filename>')
  .parse(process.argv);

// Check that global.gc() is present and print an error if not.
if (typeof global.gc !== 'function') {
  program.outputHelp();
  console.error(
      'Missing function global.gc(). Did you use `node --expose-gc` to run this script?');
  process.exit(1);
}

// Ensure that the appropriate arguments and options are there.
if (program.args.length > 1 || !program.standard && !program.incremental && !program.acorn) {
  program.help();
}

if (program.standard) {
  createMatcher = () => ES5(standard);
} else if (program.incremental) {
  createMatcher = input => {
    var m = ES5(program.nontransient ? incrementalNonTransient : incremental);
    m.applyEdit(0, 0, input);
    return m;
  }
} else if (program.acorn) {
  createMatcher = () => {
    return {
      match(input) {
        try {
          return acorn.parse(input, {ecmaVersion: 5});
        } catch (e) {
          return false;
        }
      }
    };
  };
}

measure('warmup', '');
measure('warmup', '');
measure('warmup', '');

console.log('\nMemo table heap usage:');

// The first argument, if it exists, is a path to an 'edit script' -- a CommonJS module that
// exports an array. Each entry is an array of length 3, corresponding to the three arguments
// of `applyEdit`.
var scriptPath = program.args[0];
if (scriptPath) {
  var name = path.basename(scriptPath);
  var editArr = require(path.resolve(scriptPath));
  measure(name, '', editArr, program.out);
} else {
  // If no argument is passed, run benchmarks against a set of representative ES5 inputs.
  // Run some of these multiple times to stabilize the numbers. Best guess is that fluctuations
  // are due to additional compiled code specific to each input file.
  [
    'html5shiv-3.7.3.js',
    'html5shiv-3.7.3.js',
    'html5shiv-3.7.3.js',
    'underscore-1.8.3.js',
    'underscore-1.8.3.js',
    'underscore-1.8.3.js',
    'react-15.5.4.js',
    'react-15.5.4.js',
    'react-15.5.4.js',
    'jquery-3.2.1.js',
    'jquery-3.2.1.js',
    'jquery-3.2.1.js',
    'lodash-4.17.4.js',
    'lodash-4.17.4.js',
    'lodash-4.17.4.js'
  ].forEach(filename => {
    var shortName = filename.split('-')[0];
    measure(shortName, dataFileContents(filename));
  });
}
