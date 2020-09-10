const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('../test-helper')

function slow() {
  return pull.asyncMap( (x, cb) => {
    setTimeout( ()=> cb(null, x), 100 )
  })
}

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


test('indexingSource (from start, out of order, waiting path)', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()
  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyB])
  const d = msg(keyD, keyA, [keyC])

  append(db, [a, c], seqs => {
    // wait for revisions view to be synced with db
    let i=-1
    db.revisions.since( since => {
      console.log('sv is at ', since)
      if (i>-1 || since < seqs.slice(-1)[0]) return

      i = 0
      pull(
        db.revisions.indexingSource(),
        //slow(),
        pull.drain( kvv => {
          i++
          console.log('i', i, kvv)
          if (i==1) {
            t.equal(kvv.key, keyA)
            t.equal(kvv.value.key, keyC)
            t.deepEqual(kvv.value.value, c.value)
            t.ok(kvv.value.meta.incomplete)
            t.notOk(kvv.old_value)
            return
          }
          if (i==2) {
            t.equal(kvv.since, seqs[1])
            t.notOk(kvv.value)
            t.notOk(kvv.old_value)
            
            setTimeout( ()=> {
              append(db, [b, d], newSeqs => {
                seqs = seqs.concat(newSeqs)
              })
            }, 100)
            return
          }
          if (i==3) {
            t.equal(kvv.key, keyA)
            t.equal(kvv.value.key, keyC)
            t.deepEqual(kvv.value.value, c.value)
            t.notOk(kvv.value.meta.incomplete, 'is complete now')

            t.equal(kvv.old_value.key, keyC)
            t.deepEqual(kvv.old_value.value, c.value)
            t.ok(kvv.old_value.meta.incomplete, 'was incomplete')
            return
          }
          if (i==4) {
            t.equal(kvv.since, seqs[2])
            t.notOk(kvv.value)
            t.notOk(kvv.old_value)
            return
          }
          if (i==5) {
            t.equal(kvv.key, keyA)
            t.equal(kvv.value.key, keyD)
            t.deepEqual(kvv.value.value, d.value)

            t.equal(kvv.old_value.key, keyC)
            t.deepEqual(kvv.old_value.value, c.value)
            return
          }
          if (i==6) {
            t.equal(kvv.since, seqs[3])
            t.notOk(kvv.value)
            t.notOk(kvv.old_value)
            return false
          }
        }, end => {
          console.log('drain end', end)
          t.equal(i, 6, 'Should have seen the entire stream')
          t.equal(end, true)
          db.close( ()=> t.end() )
        })
      )
    })
  })
})

test('indexingSource (from start, out of order, non-waiting path)', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()
  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyB])
  const d = msg(keyD, keyA, [keyC])

  append(db, [a, c], seqs => {
    // wait for revisions view to be synced with db
    let i=-1
    db.revisions.since( since => {
      console.log('sv is at ', since)
      if (i>-1 || since < seqs.slice(-1)[0]) return

      i = 0
      pull(
        db.revisions.indexingSource(),

        // makse sure b and d are processed as one block
        pull.asyncMap( (kvv, cb) => {
          i++
          console.log('i', i, kvv)
          if (i==1) {
            t.equal(kvv.key, keyA)
            t.equal(kvv.value.key, keyC)
            t.deepEqual(kvv.value.value, c.value)
            t.ok(kvv.value.meta.incomplete)
            t.notOk(kvv.old_value)
            return cb(null, kvv)
          }
          if (i==2) {
            t.equal(kvv.since, seqs[1])
            t.notOk(kvv.value)
            t.notOk(kvv.old_value)

            console.log('Appending b, d ...')
            append(db, [b, d], newSeqs => {
              console.log('indexing b, d ...')
              seqs = seqs.concat(newSeqs)
              db.revisions.since( s =>{
                if (s == seqs[3]) {
                  cb(null, kvv)
                  console.log('done indexing b, d')
                }
              })
            })
          }
          if (i==3) {
            t.equal(kvv.key, keyA)
            t.equal(kvv.value.key, keyD)
            t.deepEqual(kvv.value.value, d.value)
            t.notOk(kvv.value.meta.incomplete, 'is complete now')

            t.equal(kvv.old_value.key, keyC)
            t.deepEqual(kvv.old_value.value, c.value)
            t.ok(kvv.old_value.meta.incomplete, 'was incomplete')
            return cb(null, kvv)
          }
          if (i==4) {
            t.equal(kvv.since, seqs[3])
            t.notOk(kvv.value)
            t.notOk(kvv.old_value)
            return cb(true)
          }
        }),

        pull.drain( kvv => {}, end => {
          console.log('drain end', end)
          t.equal(i, 4, 'Should have seen the entire stream')
          t.equal(end, null)
          db.close( ()=> t.end() )
        })
      )
    })
  })
})

/*

test('indexingSource (custom validator)', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()
  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyA]) // fork
  const d = msg(keyD, keyA, [keyB, keyC]) // merge

  let i = -1
  
  t.plan(10)

  append(db, [a, b, c, d], seqs => {
    // wait for revisions view to be synced with db
    db.revisions.since( since => {
      if (since < seqs.slice(-1)[0]) return
      console.log('XXX sv is at ', since)

      let validatorCall = 0
      function validator(revRoot, revs, opts, cb) {
        validatorCall++
        console.log('validator call #%d: %o', validatorCall, revs)
        t.equal(revRoot, keyA, 'validator is called with correct revRoot')
        t.equal(validatorCall, 1, 'validator is called once')
        t.deepEqual(revs, [a,b,c,d], 'validator is called with all four revisions')
        cb(null, {
          heads: [d],
          meta: {
            incomplete: false,
            change_requests: 0
          }
        })
      }

      pull(
        db.revisions.indexingSource({validator}),

        pull.asyncMap( (kvv, cb) => {
          i++
          console.log('update stream item #%d', i, kvv)
          if (i==0) {
            t.equal(kvv.key, keyA, 'revisionRoot')
            t.equal(kvv.value.key, keyD, 'revisionBranch')
            t.deepEqual(kvv.value.value, d.value, 'message value')
            t.notOk(kvv.value.meta.incomplete, 'meta.incomplete')
            t.notOk(kvv.old_value, 'old_value')
            return cb(null, kvv)
          } else if (i==1) {
            t.equal(kvv.since, seqs.slice(-1)[0], '"since" item in stream')
            return cb(true)
          }         
        }),
        pull.drain( kvv => {}, end => {
          console.log('drain end', end)
          t.equal(end, null)
          db.close( ()=> t.end() )
        })
      )
    })
  })
})

*/

