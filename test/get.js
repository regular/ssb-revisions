const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')

test('old and new message wtth and without revisions', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  
  const done = multicb({pluck: 1, spread: true})
  const done1 = done()
  const done2 = done()
  const done3 = done()
  const done4 = done()
  const done5 = done()

  done( err => {
    t.error(err)
    db.close( ()=> t.end())
  })

  db.revisions.get(keyA, (err, value) => {
    t.error(err, 'no error')
    t.deepEqual(value, a.value, 'value')
    done1(err)
  })

  db.revisions.get(keyA, {meta: true}, (err, kv) => {
    t.error(err, 'no error')
    t.deepEqual(kv.value, a.value, 'value')
    t.equal(kv.meta.old, false, 'not old')
    t.equal(kv.key, keyA, 'has key')
    done2(err)
  })

  db.revisions.get(keyB, {meta: true, values: false}, (err, meta) => {
    t.error(err, 'no error')
    t.equal(meta.old, false, 'not old')
    t.equal(meta.original, false, 'no original')
    done3(err)
  })

  db.append(a, (err, data) => {
    db.revisions.get(keyA, (err, value) =>{
      t.error(err, 'no error')
      t.deepEqual(value, a.value, 'value')
      done4(err)
    })
    db.revisions.get(keyA, {meta: true}, (err, kv) =>{
      t.error(err, 'no error')
      t.deepEqual(kv.value, a.value, 'value')
      t.equal(kv.meta.old, true, 'is old')
      done5(err)
    })
  })
  db.append(b, err => {
    t.error(err)
  })
})

