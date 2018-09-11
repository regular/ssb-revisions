const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')

test('A message without revisions should have no history', (t, db) => {
  const keyA = rndKey()
  db.append(msg(keyA), (err, data) => {
    pull(
      db.revisions.history(keyA),
      pull.collect( (err, result) => {
        t.notOk(err, 'no error')
        t.equal(result.length, 0, 'history should be empty')
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
        t.equal(result.length, 2, 'history should have two entries')
        t.deepEqual(result[0], b)
        t.deepEqual(result[1], c)
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
        i++
        if (i==1) {
          t.deepEqual(rev, b)
          setImmediate( ()=> {
            db.append( c = msg(keyC, keyA, [keyB]), ()=>{} )
          })
          return
        }
        if (i==2) {
          t.deepEqual(rev, c, '2nd rev is c')
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

test('heads({live: true}): fork', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()

  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyA])

  let i = 0

  db.append([a, c], (err, data) => {
    pull(
      db.revisions.heads(keyA, {live: true}),
      pull.drain( x => {
        i++
        if (i==1) {
          t.deepEqual(x, [keyC])
          setImmediate( ()=> {
            db.append( b, ()=>{} )
          })
          return
        }
        if (i==2) {
          t.equals(x.length, 2, 'There are two heads')
          console.log(x)
          t.deepEqual(x[0], keyC, 'Winning head is keyC')
          t.deepEqual(x[1], keyB, 'keyB is secondary head')
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

test('meta/stats: forks', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()

  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyA]) // fork
  const d = msg(keyD, keyA, [keyB, keyC]) // merge

  let i = 0

  pull(
    db.revisions.stats({live: true}),
    pull.drain( s=> {
      console.log(s)
      t.equals(s.revisions, [0,1,2,3][i], 'revisions')
      t.equals(s.forks, [0,0,1,0][i], 'forks')
      t.equals(s.incomplete, [0,0,0,0][i], 'incomplete')
      i++
    }, err => {
      t.notOk(err, 'no error')
      t.equals(i, 4, 'four status updates')
      db.close( ()=> t.end())
    })
  )

  db.append([a, b, c], err => {
    if (err) throw err
    pull(
      db.revisions.heads(keyA, {meta: true}),
      pull.collect( (err, items) => {
        t.notOk(err, 'no error')
        t.equals(items.length, 1)
        t.equals(items[0].meta.forked, true, 'meta indicates a fork')

        db.append(d, err =>{
          if (err) throw err
          pull(
            db.revisions.heads(keyA, {meta: true}),
            pull.collect( (err, items) => {
              t.notOk(err, 'no error')
              t.equals(items.length, 1)
              t.notOk(items[0].meta.forked, 'meta indicates no fork')
              db.close( ()=>{} )
            })
          )
        })
      })
    )
  })
})

test('meta/stats: incomplete', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()

  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyB])

  let i = 0

  pull(
    db.revisions.stats({live: true}),
    pull.drain( s=> {
      console.log(s)
      t.equals(s.incomplete, [0,1,0][i])
      t.equals(s.forks, [0,0,0][i])
      i++
    }, err => {
      t.notOk(err, 'no error')
      t.equals(i, 3, 'three status updates')
      db.close( ()=> t.end())
    })
  )

  db.append([a, c], err => {
    if (err) throw err
    pull(
      db.revisions.heads(keyA, {meta: true}),
      pull.collect( (err, items) => {
        t.notOk(err, 'no error')
        t.equals(items.length, 1)
        t.equals(items[0].meta.incomplete, true, 'meta indicates incomplete chain of revisions')

        db.append(b, err =>{
          if (err) throw err
          pull(
            db.revisions.heads(keyA, {meta: true}),
            pull.collect( (err, items) => {
              t.notOk(err, 'no error')
              t.equals(items.length, 1)
              t.notOk(items[0].meta.incomplete, 'meta indicates completeness')
              db.close( ()=>{} )
            })
          )
        })
      })
    )
  })
})

/*
test('Revisions dont show up in originals()', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()
  let a, b, c
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
    c = msg(keyC, keyA, [keyB]),
    d = msg(keyD, keyD, [keyD])
  ], (err, data) => {
    pull(
      db.revisions.originals(),
      pull.collect( (err, result) => {
        console.log('result', result)
        t.error(err, 'no error')
        t.equal(result.length, 2, 'should have two entries')
        t.deepEqual(result[0].value, a)
        t.deepEqual(result[1].value, d)
        t.equal(result[0].seq, 0, 'Should have seq')
        t.equal(result[1].seq, 655, 'Should have seq')
        db.close( ()=> t.end())
      })
    )
  })
})

test('updates() streams latest update only', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()
  let a, b, c
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
    c = msg(keyC, keyA, [keyB]),
    d = msg(keyD, keyD, [keyD])
  ], (err, data) => {
    pull(
      db.revisions.updates(),
      pull.collect( (err, result) => {
        console.log('result', result)
        t.error(err, 'no error')
        t.equal(result.length, 1, 'should have one entry')
        t.deepEqual(result[0].value, c)
        t.equal(result[0].seq, 389, 'Should have seq')
        db.close( ()=> t.end())
      })
    )
  })
})


test('updates() streams latest update since opts.gt', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()
  let a, b, c
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
    //c = msg(keyC, keyA, [keyB]),
    //d = msg(keyD, keyD, [keyD])
  ], (err, data) => {
    pull(
      db.revisions.updates(),
      pull.collect( (err, result) => {
        console.log('result', result)
        t.error(err, 'no error')
        t.equal(result.length, 1, 'should have one entries')
        t.deepEqual(result[0].value, b)
        t.equal(result[0].seq, 123, 'Should have seq')

        db.append([
          c = msg(keyC, keyA, [keyB]),
          d = msg(keyD, keyA, [keyC])
        ], (err, data) => {

          pull(
            db.revisions.updates({gt: 123, old_values: true}),
            pull.collect( (err, result) => {
              console.log('result', result)
              t.error(err, 'no error')
              t.equal(result.length, 1, 'should have one entry')
              t.deepEqual(result[0].value, d)
              t.equal(result[0].seq, 655, 'Should have seq')
              t.equal(result[0].old_seq, 123, 'Should have old_seq')
              t.deepEqual(result[0].old_value, b)

              db.close( ()=> t.end())
            })
          )
        })
      })
    )
  })
})

test('current() streams latest update and originals', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()
  let a, b, c, d
  db.append([
    a = msg(keyA),
    b = msg(keyB),
    c = msg(keyC, keyB, [keyB]),
    d = msg(keyD, keyB, [keyC])
  ], (err, data) => {
    pull(
      db.revisions.current(),
      pull.collect( (err, result) => {
        console.log('result', result)
        t.error(err, 'no error')
        t.equal(result.length, 2, 'should have two entries')

        t.deepEqual(result.find(kvv => kvv.value.key == keyA), {value: a, seq: 0})
        t.deepEqual(result.find(kvv => kvv.value.key == keyD), {
          value: d,
          seq: 512,
          forked: false,
          old_seq: null 
        })
        pull(
          db.revisions.current({gt:246}),
          pull.collect( (err, result) => {
            console.log('result', result)
            t.equal(result.length, 1, 'should have one entry ')
            t.deepEqual(result[0], {
              value: d,
              seq: 512,
              forked: false,
              old_seq: 246
            })
            db.close( ()=> t.end())
          })
        )
      })
    )
  })
})
*/
