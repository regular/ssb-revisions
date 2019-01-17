const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')
const Stats = require('../indexes/stats')

function fooMsg(key, revRoot, revBranch, foo) {
  const ret = msg(key, revRoot, revBranch)
  ret.value.content.foo = foo
  return ret
}

function append(db, msgs, cb) {
  pull(
    pull.values(msgs),
    pull.asyncMap( (m, cb) => {
      db.append(m, cb)
    }),
    pull.asyncMap( (m, cb) => {
      setTimeout( ()=>cb(null, m), 100)
    }),
    pull.collect( (err, seqs)=>{
      if (err) throw err
      cb(seqs)
    })
  )
}

test('getStats() (one batch)', (t, db) => {
  db.revisions.use('revStats', Stats())
  t.ok(db.revisions.revStats, 'db.revisions has property revStats')
  t.equal(typeof db.revisions.revStats.get, 'function', 'revStats.get is a function')

  const keyA  = rndKey()
  const keyA1 = rndKey()
  const keyA2 = rndKey()
  const keyB  = rndKey()
  const keyB2 = rndKey()
  const keyC  = rndKey()
  const keyC2 = rndKey()


  db.append([
    fooMsg(keyA1, keyA, [keyA], 'bar2'),
    fooMsg(keyA, null, [], 'bar1'),
    fooMsg(keyA2, keyA, [keyA], 'bar3'),
    fooMsg(keyB2, keyB, [keyB], 'baz'),
    fooMsg(keyC2, keyC, [keyC], 'also incomplete')
  ], (err, seq) => {
    t.error(err)
    console.log('Waiting for', seq)
    db.revisions.revStats.get( (err, data) => {
      t.error(err)
      t.equal(db.revisions.revStats.since.value, seq, 'Should have waited until view is uo-to-date')
      t.deepEqual(data, { incomplete: 2, forked: 1 }, 'stats should be correct')
      db.close( ()=> t.end() )
    })
  })
})

test('getStats() / stremStats() (slow updates)', (t, db) => {
  db.revisions.use('revStats', Stats())
  t.ok(db.revisions.revStats, 'db.revisions has property revStats')
  t.equal(typeof db.revisions.revStats.get, 'function', 'revStats.get is a function')
  t.equal(typeof db.revisions.revStats.stream, 'function', 'revStats.get is a function')

  const keyA  = rndKey()
  const keyA1 = rndKey()
  const keyA2 = rndKey()
  const keyB  = rndKey()
  const keyB2 = rndKey()
  const keyC  = rndKey()
  const keyC2 = rndKey()

  const done = multicb({pluck: 1})
  const doneStream = done()
  const doneGet = done()
  done( err => {
    t.error(err)
    t.end()
  })

  pull(
    db.revisions.revStats.stream({live: true}),
    pull.take(6),
    pull.collect( (err, updates) => {
      t.error(err)
      console.log('UPDATES', updates) 
      t.deepEqual( updates, [
        // initial
        {incomplete: 0, forked: 0},
        [ // A1
          {forked: false, incomplete: true, change_requests: 0},
          null
        ],
        [ // A
          {forked: false, incomplete: false, change_requests: 0},
          {forked: false, incomplete: true, change_requests: 0}
        ],
        [ // A2
          {forked: true, incomplete: false, change_requests: 0},
          {forked: false, incomplete: false, change_requests: 0}
        ],
        [ // B2
          {forked: false, incomplete: true, change_requests: 0},
          null
        ],
        [ // C2
          {forked: false, incomplete: true, change_requests: 0},
          null
        ]
      ], 'stats map output')
      doneStream(null)
    })
  )

  append(db, [
    fooMsg(keyA1, keyA, [keyA], 'bar2'),
    fooMsg(keyA, null, [], 'bar1'),
    fooMsg(keyA2, keyA, [keyA], 'bar3'),
    fooMsg(keyB2, keyB, [keyB], 'baz'),
    fooMsg(keyC2, keyC, [keyC], 'also incomplete')
  ], seqs => {
    console.log('appended ', seqs)
    
    db.revisions.revStats.get( (err, stats) => {
      t.error(err)
      t.deepEqual(
        stats,
        {incomplete: 2, forked: 1},
        'stats.get()'
      )
      db.close( err =>{
        console.log('closed DB')
        doneGet(err)
      })
    })
  })
})
