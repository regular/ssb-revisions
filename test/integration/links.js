const crypto = require('crypto')
const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('../test-helper')

test('links {to: x}', (t, db) => {
  const keyA = debugKey('keyA')
  const cat = debugKey('cat')
  const dog = debugKey('dog')
  const keyA1 = debugKey('keyA1')
  const keyA2 = debugKey('keyA2')
  const a = msg(keyA)
  const a1 = msg(keyA1, keyA, [keyA])
  const a2 = msg(keyA2, keyA, [keyA1])

  a.value.content.link = dog
  a1.value.content.link = dog
  a2.value.content.link = cat

  const done = multicb({pluck: 1})
  const cb1 = done()
  const cb2 = done()

  pull(
    db.revisions.links({to: cat, live: true, sync: false}),
    pull.take(1),
    pull.collect( (err, results) => {
      if (err) return cb1(err)
      console.log('cat results', results)
      t.deepEqual(results[0].key, ['link', cat, keyA])
      t.deepEqual(results[0].value, a2)
      cb1()
    })
  )

  pull(
    db.revisions.links({to: dog, live: true, sync: false}),
    pull.take(3),
    pull.collect( (err, results) => {
      if (err) return cb2(err)
      console.log('dog results', results)
      t.deepEqual(results[0].key, ['link', dog, keyA])
      t.deepEqual(results[0].value, a)
      t.deepEqual(results[1].key, ['link', dog, keyA])
      t.deepEqual(results[1].value, a1)
      t.deepEqual(results[2].key, ['link', dog, keyA])
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

test('links {rel: x}', (t, db) => {
  const keyA = debugKey('keyA')
  const cat = debugKey('cat')
  const dog = debugKey('dog')
  const keyA1 = debugKey('keyA1')
  const keyA2 = debugKey('keyA2')
  const a = msg(keyA)
  const a1 = msg(keyA1, keyA, [keyA])
  const a2 = msg(keyA2, keyA, [keyA1])

  a.value.content.owns= dog
  a1.value.content.owns = cat
  a2.value.content.ownedBy = cat

  const done = multicb({pluck: 1})
  const cb1 = done()
  const cb2 = done()

  pull(
    db.revisions.links({rel: 'ownedBy', live: true, sync: false}),
    pull.take(1),
    pull.collect( (err, results) => {
      if (err) return cb1(err)
      console.log('cat results', results)
      t.deepEqual(results[0].key, ['ownedBy', cat, keyA])
      t.deepEqual(results[0].value, a2)
      cb1()
    })
  )

  pull(
    db.revisions.links({rel: 'owns', live: true, sync: false}),
    pull.take(3),
    pull.collect( (err, results) => {
      if (err) return cb2(err)
      console.log('dog results', results)
      t.deepEqual(results[0].key, ['owns', dog, keyA])
      t.deepEqual(results[0].value, a)
      t.deepEqual(results[1].key, ['owns', cat, keyA])
      t.deepEqual(results[1].value, a1)
      t.deepEqual(results[2].key, ['owns', dog, keyA])
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

test('links {rel: x, to: y}', (t, db) => {
  const keyA = debugKey('keyA')
  const cat = debugKey('cat')
  const dog = debugKey('dog')
  const keyA1 = debugKey('keyA1')
  const keyA2 = debugKey('keyA2')
  const a = msg(keyA)
  const a1 = msg(keyA1, keyA, [keyA])
  const a2 = msg(keyA2, keyA, [keyA1])

  a.value.content.owns= dog
  a1.value.content.owns = cat
  a2.value.content.ownedBy = cat

  pull(
    db.revisions.links({rel: 'owns', to: cat, live: true, sync: false}),
    pull.take(1),
    pull.collect( (err, results) => {
      if (err) return cb1(err)
      console.log('cat results', results)
      t.deepEqual(results[0].key, ['owns', cat, keyA])
      t.deepEqual(results[0].value, a1)
      t.end()
    })
  )

  append(db, [a, a1, a2], ()=>{})
})

test('links {}', (t, db) => {
  const keyA = debugKey('keyA')
  const cat = debugKey('cat')
  const dog = debugKey('dog')
  const keyA1 = debugKey('keyA1')
  const keyA2 = debugKey('keyA2')
  const a = msg(keyA)
  const a1 = msg(keyA1, keyA, [keyA])
  const a2 = msg(keyA2, keyA, [keyA1])

  a.value.content.owns= dog
  a1.value.content.owns = cat
  a2.value.content.ownedBy = cat

  pull(
    db.revisions.links({live: true, sync: false}),
    pull.take(5),
    pull.collect( (err, results) => {
      if (err) throw err
      console.log('results', results)
      t.deepEqual(results[0].key, ['owns', dog, keyA])
      t.deepEqual(results[0].value, a)

      t.deepEqual(results[1].key, ['owns', cat, keyA])
      t.deepEqual(results[1].value, a1)

      t.deepEqual(results[2].key, ['owns', dog, keyA])
      t.deepEqual(results[2].type, 'del')

      t.deepEqual(results[3].key, ['ownedBy', cat, keyA])
      t.deepEqual(results[3].value, a2)

      t.deepEqual(results[4].key, ['owns', cat, keyA])
      t.deepEqual(results[4].type, 'del')
      t.end()
    })
  )

  append(db, [a, a1, a2], ()=>{})
})

test('all blobs {to: "&"}', (t, db) => {
  const keyA = debugKey('keyA')
  const cat = blob('cat')
  const dog = blob('dog')
  const keyA1 = debugKey('keyA1')
  const keyA2 = debugKey('keyA2')
  const keyA3 = debugKey('keyA3')
  const a = msg(keyA)
  const a1 = msg(keyA1, keyA, [keyA])
  const a2 = msg(keyA2, keyA, [keyA1])
  const a3 = msg(keyA3, keyA, [keyA2])

  a.value.content.owns= dog
  
  a1.value.content.owns = cat

  a2.value.content.owns = cat
  a2.value.content.foo = 'bar'
  
  a3.value.content.ownedBy = cat

  pull(
    db.revisions.links({to: '&', live: true, sync: false}),
    pull.take(6),
    pull.collect( (err, results) => {
      if (err) throw err
      console.log('results', results)
      t.deepEqual(results[0].key, ['owns', dog, keyA])
      t.deepEqual(results[0].value, a)

      t.deepEqual(results[1].key, ['owns', cat, keyA])
      t.deepEqual(results[1].value, a1)

      t.deepEqual(results[2].key, ['owns', dog, keyA])
      t.deepEqual(results[2].type, 'del')

      t.deepEqual(results[3].key, ['owns', cat, keyA])
      t.deepEqual(results[3].value, a2)

      t.deepEqual(results[4].key, ['ownedBy', cat, keyA])
      t.deepEqual(results[4].value, a3)

      t.deepEqual(results[5].key, ['owns', cat, keyA])
      t.deepEqual(results[5].type, 'del')
      t.end()
    })
  )

  append(db, [a, a1, a2, a3], ()=>{})
})

test('all blobs {to: "&", values: false}', (t, db) => {
  const keyA = debugKey('keyA')
  const cat = blob('cat')
  const dog = blob('dog')
  const keyA1 = debugKey('keyA1')
  const keyA2 = debugKey('keyA2')
  const keyA3 = debugKey('keyA3')
  const a = msg(keyA)
  const a1 = msg(keyA1, keyA, [keyA])
  const a2 = msg(keyA2, keyA, [keyA1])
  const a3 = msg(keyA3, keyA, [keyA2])

  a.value.content.owns= dog
  
  a1.value.content.owns = cat

  a2.value.content.owns = cat
  a2.value.content.foo = 'bar'
  
  a3.value.content.ownedBy = cat

  pull(
    db.revisions.links({to: '&', live: true, values: false, sync: false}),
    pull.take(6),
    pull.collect( (err, results) => {
      if (err) throw err
      console.log('results', results)
      t.deepEqual(results[0].key, ['owns', dog, keyA])
      t.notOk(results[0].value)

      t.deepEqual(results[1].key, ['owns', cat, keyA])
      t.notOk(results[1].value)

      t.deepEqual(results[2].key, ['owns', dog, keyA])
      t.deepEqual(results[2].type, 'del')

      t.deepEqual(results[3].key, ['owns', cat, keyA])
      t.notOk(results[3].value)

      t.deepEqual(results[4].key, ['ownedBy', cat, keyA])
      t.notOk(results[4].value)

      t.deepEqual(results[5].key, ['owns', cat, keyA])
      t.deepEqual(results[5].type, 'del')
      t.end()
    })
  )

  append(db, [a, a1, a2, a3], ()=>{})
})
// utils ///

function debugKey(name) {
  return '%' + name + '//' + rndKey().substr(name.length+3)
}

function blob(name) {
  return '&' + name + '//' + crypto.createHash('sha256').update(name).digest('base64').substr(name.length+2) + '.sha256'
}

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


