const fs = require('fs');
const test = require('tape');

const es5 = require('../src/es5');
const incremental = require('../src/incremental');
const standard = require('../src/standard');

const input = fs.readFileSync(__dirname + '/data/html5shiv-3.7.3.js').toString();

// Helpers
// -------

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function get(tree, path) {
  let ans = tree;
  const rules = path.split('/');
  for (let r of rules) {
    ans = ans[0];
    assert(ans.type == null || ans.type === r, `expected '${r}', got ${ans.type}`);
  }
  return ans;
}

// Pseudo-random number generator based on http://www.firstpr.com.au/dsp/rand31/.
function initRandom(seed) {
  let val = seed % 2147483647;
  return () => val = (val * 16807) % 2147483647;
}

// Given a tree that is the result of parsing an immediately-invoked function expression (IIFE),
// return an array containing the statements in the function body.
function getIIFEBodyStatements(tree) {
  const [sourceElements] = tree;

  // If the IIFE is preceded by a semicolon (i.e., an empty statement), drop it.
  if (sourceElements[0][1] === ';') {
    sourceElements.shift();
  }
  assert(sourceElements.length === 1, 'expected exactly one (non-empty) statement');

  const stmt = sourceElements[0];

  const priExp = get(stmt, 'expression/callExpression/memberExpression/primaryExpression');
  const [ , , exp, , ] = priExp;
  const funcExp = get(exp, 'callExpression/memberExpression/functionExpression');
  const [ , kw, , open, params, , close, , openBrace, body, , closeBrace] = funcExp;

  assert(closeBrace === '}');
  assert(kw[0] === 'function');

  const [bodyStatements] = body;

  return bodyStatements;
}

// Tests
// -----

test('standard', t => {
  const matcher = es5(standard);

  const tree = matcher.match(input);
  t.ok(tree, 'succesfully matches html5shiv source');

  // Get the second-last statement, the call `shivDocument(document)`.
  const bodyStatements = getIIFEBodyStatements(tree);
  const stmt = bodyStatements[bodyStatements.length - 2];

  // Get the identifier name from the callExpression.
  const exp = get(stmt, 'expression/callExpression/memberExpression/primaryExpression');
  const name = get(exp[1], 'identifierName');
  const nameStr = [name[0]].concat(name[1]).join('');

  t.equal(nameStr, 'shivDocument');

  t.end();
});

test('incremental', t => {
  const matcher = es5(standard);
  const incMatcher = es5(incremental);
  const rand = initRandom(1979);

  incMatcher.applyEdit(0, 0, input);

  const expectedTree = matcher.match(input);
  t.deepEqual(expectedTree, incMatcher.match(), 'initial parse is same as standard');

  // Do a few no-op edits, and make sure the tree is always the same as standard's.
  for (let i = 0; i < 10; i++) {
    const pos = [rand(), rand()].map(n => n % input.length).sort((a, b) => a - b);
    incMatcher.applyEdit(pos[0], pos[1], input.slice(pos[0], pos[1]));
    t.deepEqual(expectedTree, incMatcher.match(), `edit at ${pos[0]},${pos[1]}`);
  }
  incMatcher.applyEdit(0, 1, input.slice(0, 1), 'after editing first char');

  // Delete the text 'shivDocument(document);' and replace it with 'doIt(doc)'.
  const edits = [
    [10161, 10184, '', true],
    [10161, 10161, 'd', true],
    [10162, 10162, 'o', false],  // fails b/c `do` is a keyword!
    [10163, 10163, 'I', true],
    [10164, 10164, 't', true],
    [10165, 10165, '(', false],
    [10166, 10166, 'd', false],
    [10167, 10167, 'o', false],
    [10168, 10168, 'c', false],
    [10169, 10169, ')', true]
  ];
  let tree = null;
  edits.forEach(([start, end, r, shouldMatch], i) => {
    incMatcher.applyEdit(start, end, r);
    tree = incMatcher.match();
    if (shouldMatch) {
      t.ok(tree, `iter #${i}`);
    } else {
      t.equal(tree, null, `iter #${i}`);
    }
    console.log(shouldMatch, !!tree);
  });

  // Now find the call in the tree and make sure it's correct.
  const bodyStatements = getIIFEBodyStatements(tree);
  const stmt = bodyStatements[bodyStatements.length - 2];

  // Get the identifier name from the callExpression.
  const exp = get(stmt, 'expression/callExpression/memberExpression/primaryExpression');
  const name = get(exp[1], 'identifierName');
  const nameStr = [name[0]].concat(name[1]).join('');

  t.equal(nameStr, 'doIt');

  t.end();
});
