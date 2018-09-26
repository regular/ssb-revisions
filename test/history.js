const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')

test('A message without revisions should have one history entry', (t, db) => {
  const keyA = rndKey()
  const a = msg(keyA)
  db.append(a, (err, data) => {
    pull(
      db.revisions.history(keyA),
      pull.collect( (err, result) => {
        t.notOk(err, 'no error')
        t.equal(result.length, 1, 'history should have one entry')
        t.deepEqual(result[0], a)
        db.close( ()=> t.end())
      })
    )
  })
})

test('Revisions show up in history', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
    c = msg(keyC, keyA, [keyB])
  ], (err, data) => {
    pull(
      db.revisions.history(keyA),
      pull.collect( (err, result) => {
        console.log(result)
        t.notOk(err, 'no error')
        t.equal(result.length, 3, 'history should have 3 entries')
        t.deepEqual(result[0], a)
        t.deepEqual(result[1], b)
        t.deepEqual(result[2], c)
        db.close( ()=> t.end())
      })
    )
  })
})

test('history({live: true})', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c
  let i = 0
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
  ], (err, data) => {
    pull(
      db.revisions.history(keyA, {live: true}),
      pull.drain( rev => {
        console.log('rev', rev)
        i++
        if (i==1) {
          t.deepEqual(rev, a)
          return
        }
        if (i==2) {
          t.deepEqual(rev, b)
          setImmediate( ()=> {
            db.append( c = msg(keyC, keyA, [keyB]), ()=>{} )
          })
          return
        }
        if (i==3) {
          t.deepEqual(rev, {sync: true}, 'includes sync')
          return
        }
        if (i==4) {
          t.deepEqual(rev, c, '3rd rev is c')
          return false
        }
        t.fail('stream too long')
      }, end => {
        t.equal(end, true)
        t.equal(i, 4)
        db.close( ()=> t.end())
      })
    )
  })
})

test('history({live: true, sync: false, keys: false})', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c
  let i = 0
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
  ], (err, data) => {
    pull(
      db.revisions.history(keyA, {
        live: true,
        keys: false,
        sync: false
      }),
      pull.drain( rev => {
        console.log('rev', rev)
        i++
        if (i==1) {
          t.deepEqual(rev, a.value)
          return
        }
        if (i==2) {
          t.deepEqual(rev, b.value)
          setImmediate( ()=> {
            db.append( c = msg(keyC, keyA, [keyB]), ()=>{} )
          })
          return
        }
        if (i==3) {
          t.deepEqual(rev, c.value, '3rd rev is c')
          return false
        }
        t.fail('stream too long')
      }, end => {
        t.equal(end, true)
        t.equal(i, 3)
        db.close( ()=> t.end())
      })
    )
  })
})

test('history({live: true, values: false, gt: 123})', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c
  let i = 0
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
  ], (err, data) => {
    pull(
      db.revisions.history(keyA, {
        live: true,
        values: false,
        gt: 123
      }),
      pull.drain( rev => {
        console.log('rev', rev)
        i++
        if (i==1) {
          t.deepEqual(rev, {sync: true})
          setImmediate( ()=> {
            db.append( c = msg(keyC, keyA, [keyB]), ()=>{} )
          })
          return
        }
        if (i==2) {
          t.deepEqual(rev, c.key)
          return false
        }
        t.fail('stream too long')
      }, end => {
        t.equal(end, true)
        t.equal(i, 2)
        db.close( ()=> t.end())
      })
    )
  })
})

test('history({live: true, values: false, gte: 123})', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c
  let i = 0
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
  ], (err, data) => {
    pull(
      db.revisions.history(keyA, {
        live: true,
        values: false,
        gte: 123
      }),
      pull.drain( rev => {
        console.log('rev', rev)
        i++
        if (i==1) {
          t.deepEqual(rev, b.key)
          return
        }
        if (i==2) {
          t.deepEqual(rev, {sync: true})
          setImmediate( ()=> {
            db.append( c = msg(keyC, keyA, [keyB]), ()=>{} )
          })
          return
        }
        if (i==3) {
          t.deepEqual(rev, c.key)
          return false
        }
        t.fail('stream too long')
      }, end => {
        t.equal(end, true)
        t.equal(i, 3)
        db.close( ()=> t.end())
      })
    )
  })
})

test('history({lt: 123})', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
    c = msg(keyC, keyA, [keyB])
  ], (err, data) => {
    pull(
      db.revisions.history(keyA, {
        lt: 123
      }),
      pull.collect( (err, revisions) => {
        t.error(err)
        t.equal(revisions.length, 1)
        t.deepEqual(revisions[0], a)
        db.close( ()=> t.end())
      })
    )
  })
})

test('history({lte: 123})', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
    c = msg(keyC, keyA, [keyB])
  ], (err, data) => {
    pull(
      db.revisions.history(keyA, {
        lte: 123
      }),
      pull.collect( (err, revisions) => {
        t.error(err)
        t.equal(revisions.length, 2)
        t.deepEqual(revisions[0], a)
        t.deepEqual(revisions[1], b)
        db.close( ()=> t.end())
      })
    )
  })
})

function append(db, msgs, cb) {
  pull(
    pull.values(msgs),
    pull.asyncMap( (m, cb) => {
      db.append(m, cb)
    }),
    pull.collect( (err, seqs)=>{
      if (err) throw err
      cb(seqs)
    })
  )
}

test('history (seqs)', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyB])

  append(db, [a, b, c], seqs => {
    pull(
      db.revisions.history(keyA, {values: false, keys: false, seqs: true}),
      pull.collect( (err, items) => {
        t.notOk(err, 'no error')
        console.log('items', items)
        t.equal(items.length, 3)
        t.deepEquals(items, seqs)
        t.end()
      })
    )
  })
})

