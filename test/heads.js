const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')

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


