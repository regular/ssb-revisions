const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('../test-helper')

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
  test(fun, (t, db) => {
    const keyA = rndKey()
    const keyA1 = rndKey()
    const keyA2 = rndKey()
    const a = msg(keyA)
    const a1 = msg(keyA1, keyA, [keyA])
    const a2 = msg(keyA2, keyA, [keyA1])

    a.value.content[prop] = 'dog'
    a1.value.content[prop] = 'dog'
    a2.value.content[prop] = 'cat'

    const done = multicb({pluck: 1})
    const cb1 = done()
    const cb2 = done()

    pull(
      db.revisions[fun]('cat', {live: true, sync:false}),
      pull.take(1),
      pull.collect( (err, results) => {
        if (err) return cb1(err)
        console.log('cat results', results)
        t.deepEqual(results[0].key, ['cat', keyA])
        t.deepEqual(results[0].value, a2)
        cb1()
      })
    )

    pull(
      db.revisions[fun]('dog', {live: true, sync: false}),
      pull.take(3),
      pull.collect( (err, results) => {
        if (err) return cb2(err)
        console.log('dog results', results)
        t.deepEqual(results[0].key, ['dog', keyA])
        t.deepEqual(results[0].value, a)
        t.deepEqual(results[1].key, ['dog', keyA])
        t.deepEqual(results[1].value, a1)
        t.deepEqual(results[2].key, ['dog', keyA])
        t.equal(results[2].type, 'del')
        cb2()
      })
    )

    append(db, [a, a1, a2], ()=>{})

    done( err =>{
      if (err) console.log(err)
      console.log('done')
      t.end()
    })
  })
}

run_test('type', 'messagesByType')
run_test('branch', 'messagesByBranch')

