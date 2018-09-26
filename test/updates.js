const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')

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

test('updates (single)', (t, db) => {
  const keyA = rndKey()
  const a = msg(keyA)

  append(db, [a], seqs => {
    db.revisions.since( since => {
      console.log('sv is at ', since)
      if (since< seqs.slice(-1)[0]) return
      pull(
        db.revisions.updates(),
        pull.collect( (err, items) => {
          t.notOk(err, 'no error')
          console.log('items', items)
          t.equal(items.length, 2)
          t.deepEquals(items[0], {
            key: keyA,
            value: a.value,
            old_value: null
          })
          t.deepEquals(items[1], {
            since: seqs[0]
          })
          t.end()
        })
      )
    })
  })
})

test('updates {since: 0}', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const a = msg(keyA)
  const b = msg(keyB)

  append(db, [a, b], seqs => {
    db.revisions.since( since => {
      console.log('sv is at ', since)
      if (since< seqs.slice(-1)[0]) return
      pull(
        db.revisions.updates({since: seqs[0]}),
        pull.collect( (err, items) => {
          t.notOk(err, 'no error')
          console.log('items', items)
          t.equal(items.length, 2)
          t.deepEquals(items[0], {
            key: keyB,
            value: b.value,
            old_value: null
          })
          t.deepEquals(items[1], {
            since: seqs[1]
          })
          t.end()
        })
      )
    })
  })
})

/*
test('heads: ranges', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()

  const b = msg(keyB, keyA, [keyA])
  const a = msg(keyA)
  const c = msg(keyC, keyA, [keyA]) // fork
  const d = msg(keyD, keyA, [keyB, keyC]) // merge

  append(db, [b, a, c, d], seqs => {
    console.log('seqs', seqs)
    
    pull(
      pull.once('hello'),

      // look at a only
      pull.asyncMap( (_, cb) => {
        pull(
          db.revisions.heads(keyA, {meta: true, lt: seqs[1]}),
          pull.collect( (err, items) => {
            console.log('items', items)
            t.notOk(err, 'no error')
            t.equals(items.length, 1)
            t.deepEquals(items[0].heads, [b])
            t.equals(items[0].meta.incomplete, true, 'is incomplete')
            t.equals(items[0].meta.forked, false, 'not forked')
            cb(null)
          })
        )
      }),

      // look at b and a
      pull.asyncMap( (_, cb) => {
        pull(
          db.revisions.heads(keyA, {meta: true, lt: seqs[2]}),
          pull.collect( (err, items) => {
            console.log('items', items)
            t.notOk(err, 'no error')
            t.equals(items.length, 1)
            t.deepEquals(items[0].heads, [b])
            t.equals(items[0].meta.incomplete, false, 'is not incomplete')
            t.equals(items[0].meta.forked, false, 'not forked')
            cb(null)
          })
        )
      }),

      // look at a and c
      pull.asyncMap( (_, cb) => {
        pull(
          db.revisions.heads(keyA, {
            meta: true,
            gt: seqs[0],
            lte: seqs[2]
          }),
          pull.collect( (err, items) => {
            console.log('items', items)
            t.notOk(err, 'no error')
            t.equals(items.length, 1)
            t.deepEquals(items[0].heads, [c])
            t.equals(items[0].meta.incomplete, false, 'is not incomplete')
            t.equals(items[0].meta.forked, false, 'not forked')
            cb(null)
          })
        )
      }),

      pull.onEnd( err =>{
        if (err) throw err
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
          t.deepEqual(x, [c])
          setImmediate( ()=> {
            db.append( b, ()=>{} )
          })
          return
        }
        if (i==2) {
          t.equals(x.length, 2, 'There are two heads')
          console.log(x)
          t.deepEqual(x[0], c, 'Winning head is keyC')
          t.deepEqual(x[1], b, 'keyB is secondary head')
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

test('heads({meta: true}) forks', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()

  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyA]) // fork
  const d = msg(keyD, keyA, [keyB, keyC]) // merge

  db.append([a, b, c], err => {
    if (err) throw err
    pull(
      db.revisions.heads(keyA, {meta: true}),
      pull.collect( (err, items) => {
        t.notOk(err, 'no error')
        t.equals(items.length, 1)
        t.deepEquals(items[0].heads, [c, b], 'C wins because it is newer')
        t.equals(items[0].meta.forked, true, 'meta indicates a fork')

        db.append(d, err =>{
          if (err) throw err
          pull(
            db.revisions.heads(keyA, {meta: true}),
            pull.collect( (err, items) => {
              t.notOk(err, 'no error')
              t.equals(items.length, 1)
              t.deepEquals(items[0].heads, [d], 'D is new head')
              t.notOk(items[0].meta.forked, 'meta indicates no fork')
              db.close( ()=>{t.end()} )
            })
          )
        })
      })
    )
  })
})
*/
