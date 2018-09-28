const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')
const Stats = require('../indexes/stats')

function fooMsg(key, revRoot, revBranch, foo) {
  const ret = msg(key, revRoot, revBranch)
  ret.value.content.foo = foo
  return ret
}

test('use() registers a view', (t, db) => {
  db.revisions.use('revStats', Stats())
  t.ok(db.revisions.revStats, 'db.revisions has property revStats')
  t.equal(typeof db.revisions.revStats.get, 'function', 'revStats.get is a function')

  const keyA  = rndKey()
  const keyA1 = rndKey()
  const keyA2 = rndKey()
  const keyB  = rndKey()
  const keyB2 = rndKey()

  db.append([
    fooMsg(keyA1, keyA, [keyA], 'bar2'),
    fooMsg(keyA, null, [], 'bar1'),
    fooMsg(keyA2, keyA, [keyA], 'bar3'),
    fooMsg(keyB2, keyB, [keyB], 'baz')
  ], (err, seq) => {
    t.error(err)
    console.log('Waiting for', seq)
    db.revisions.revStats.get( (err, data) => {
      t.error(err)
      t.equal(db.revisions.revStats.since.value, seq, 'Should have waited until view is uo-to-date')
      t.deepEqual(data, { incomplete: 1, forked: 1 }, 'stats should be correct')
      db.close( ()=> t.end() )
    })
  })
})
