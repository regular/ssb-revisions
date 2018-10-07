const pull = require('pull-stream')
const multicb = require('multicb')
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

function run_test(prop, fun) {
  test('simple', (t, db) => {
    const keyA = rndKey()
    const keyA1 = rndKey()
    const a = msg(keyA)
    const a1 = msg(keyA1, keyA, [keyA])

    a.value.content[prop] = 'dog'
    a1.value.content[prop] = 'cat'

    const done = multicb()
    const cb1 = done()
    const cb2 = done()

    pull(
      db.revisions[fun]('cat', {live: true, sync:false}),
      pull.take(1),
      pull.collect( (err, results) => {
        console.log('cat results', results)
        t.deepEqual(results[0].key, ['cat', keyA1])
        t.deepEqual(results[0].value, a1)
        cb1()
      })
    )

    pull(
      db.revisions[fun]('dog', {live: true, sync: false}),
      pull.take(2),
      pull.collect( (err, results) => {
        console.log('dog results', results)
        t.deepEqual(results[0].key, ['dog', keyA])
        t.deepEqual(results[0].value, a)
        t.deepEqual(results[0].key, ['dog', keyA])
        t.equal(results[1].type, 'del')
        cb2()
      })
    )

    append(db, [a, a1], done())

    done( ()=>{
      t.end()
    })
  })
}

run_test('type', 'messagesByType')
run_test('branch', 'messagesByBranch')

