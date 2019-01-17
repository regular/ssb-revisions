const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')

test('old and new message without revisions', (t, db) => {
  const keyA = rndKey()
  const a = msg(keyA)
  
  const done = multicb({pluck: 1, spread: true})
  const done1 = done()
  const done2 = done()

  done( err => {
    t.error(err)
    db.close( ()=> t.end())
  })

  db.revisions.getLatestRevision(keyA, (err, kv) => {
    t.error(err, 'no error')
    t.equal(kv.key, keyA, 'key')
    t.deepEqual(kv.value, a.value, 'value a')
    t.equal(kv.meta.old, false, 'not old')
    t.equal(kv.meta.original, true, 'is original')
    done1(err)
  })

  db.append(a, (err, data) => {
    db.revisions.getLatestRevision(keyA, (err, kv) => {
      t.error(err, 'no error')
      t.equal(kv.key, keyA, 'key a')
      t.deepEqual(kv.value, a.value, 'value a')
      t.equal(kv.meta.old, true, 'is old')
      t.equal(kv.meta.original, true, 'is original')
      done2(err)
    })
  })
})

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

  done( err => {
    t.error(err)
    db.close( ()=> t.end())
  })

  db.revisions.getLatestRevision(keyB, (err, kv) => {
    t.error(err, 'no error')
    t.equal(kv.key, keyB, 'was waiting for keyb to show up')
    t.deepEqual(kv.value, b.value, 'value')
    t.equal(kv.meta.old, false, 'not old')
    t.equal(kv.meta.original, false, 'not original')
    done1(err)
  })

  db.append(a, (err, data) => {

    db.revisions.getLatestRevision(keyB, (err, kv) => {
      t.error(err, 'no error')
      t.equal(kv.key, keyB, 'was still waiting for keyB to show up')
      t.deepEqual(kv.value, b.value, 'value')
      t.equal(kv.meta.old, false, 'not old')
      t.equal(kv.meta.original, false, 'not original')
      done2(err)
    })

    db.append(b, err => {
      t.error(err)
      db.revisions.getLatestRevision(keyA, (err, kv) => {
        t.error(err, 'no error')
        t.equal(kv.key, keyB, 'key b, since b is there, return b')
        t.deepEqual(kv.value, b.value, 'value b')
        t.equal(kv.meta.old, true, 'is old')
        t.equal(kv.meta.original, false, 'not original')
        done3(err)
      })

      db.revisions.getLatestRevision(keyB, (err, kv) => {
        t.error(err, 'no error')
        t.equal(kv.key, keyB, 'key b')
        t.deepEqual(kv.value, b.value, 'value b')
        t.equal(kv.meta.old, true, 'old')
        t.equal(kv.meta.original, false, 'not original')
        done4(err)
      })
    })
  })
})
