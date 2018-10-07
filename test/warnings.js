const pull = require('pull-stream')
const {test, msg, rndKey} = require('./test-helper')

function append(db, msgs, cb) {
  pull(
    pull.values(msgs),
    pull.asyncMap( (m, cb) => {
      db.append(m, cb)
    }),
    pull.asyncMap( (x, cb) => {
      setTimeout( ()=>cb(null, x), 100)
    }),
    pull.collect( (err, seqs)=>{
      if (err) throw err
      cb(seqs)
    })
  )
}

test('simple', (t, db) => {
  const keyA = rndKey()
  const keyA1 = rndKey()
  const keyA2 = rndKey()
  const keyA3 = rndKey()

  const a = msg(keyA)
  const a1 = msg(keyA1, keyA, [keyA])
  const a2 = msg(keyA2, keyA, [keyA])
  const a3 = msg(keyA3, keyA, [keyA1, keyA2])

  pull(
    db.revisions.warnings({live: true, sync:false}),
    pull.take(4),
    pull.collect( (err, results) => {
      console.log('warnings', results)
      t.deepEqual(results[0].key, ['I', keyA])
      t.deepEqual(results[0].value, a1)
      t.deepEqual(results[1].key, ['I', keyA])
      t.equal(results[1].type, 'del')
      t.deepEqual(results[2].key, ['F', keyA])
      t.deepEqual(results[2].value, a2)
      t.deepEqual(results[3].key, ['F', keyA])
      t.equal(results[3].type, 'del')
      t.end()
    })
  )

  append(db, [a1, a, a2, a3], ()=>{})
})
