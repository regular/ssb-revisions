const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')

test('updates should be sorted by since', (t, db) => {
  const keyA = rndKey()
  const keyA1 = rndKey()
  const keyB = rndKey()
  const keyB1 = rndKey()
  const keyC = rndKey()
  const keyC1 = rndKey()
  db.append([
    msg(keyB1, keyB, [keyB]),
    msg(keyC),
    msg(keyB),
    msg(keyC1, keyC, [keyC]),
    msg(keyA1, keyA, [keyA]),
    msg(keyA)
  ], (err, data) => {
    pull(
      db.revisions.updates(),
      pull.collect( (err, result) => {
        console.log('result', JSON.stringify(result, null, 2))
        t.error(err, 'no error')
        t.equal(result.length, 3, 'should have trhee entries')
        t.deepEqual(
          result.map( r=>r.since ).sort(),
          result.map( r=>r.since )
        )
        db.close( ()=> t.end())
      })
    )
  })
})

test('current(): shadowed original', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  let a, b
  db.append([
    b = msg(keyB, keyA, [keyA]),
    a = msg(keyA),
  ], (err, data) => {
    pull(
      db.revisions.current(),
      pull.collect( (err, result) => {
        console.log('result', JSON.stringify(result, null, 2))
        t.error(err, 'no error')
        t.equal(result.length, 2, 'should have two entries')
        t.notOk(result[1].value, 'should have no value')
        t.ok(result[1].since, 'should have since value > 0')
        db.close( ()=> t.end())
      })
    )
  })
})

test('originals({live:true})', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c, n=0
  const done = multicb()
  pull(
    db.revisions.originals({live: true}),
    pull.drain( result => {
      n++
      console.log(n, result)
      if (n==1) {
        t.equal(result.value.key, keyA)
        t.deepEqual(result.value, a)
        t.equal(result.since, 0)
      } else if (n==2) {
        t.notOk(result.value, 'Should not have a value')
        t.equal(typeof result.since, 'number', 'since should be a number')
      } else if (n==3) {
        t.equal(result.value.key, keyC)
        t.deepEqual(result.value, c)
        t.equal(typeof result.since, 'number', 'since should be a number')
        return false
      } 
    }, done())
  )
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
    c = msg(keyC)
  ], done())
  done( ()=> db.close( ()=> t.end()) )
})

test('updates({live:true})', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c, n=0
  const done = multicb()
  pull(
    db.revisions.updates({live: true}),
    pull.drain( result => {
      n++
      console.log(n, result)
      if (n==1) {
        t.equal(result.value.key, keyB)
        t.deepEqual(result.value, b)
        t.equal(typeof result.since, 'number', 'since is a number')
      } else if (n==2) {
        t.equal(result.value.key, keyC)
        t.deepEqual(result.value, c)
        t.equal(typeof result.since, 'number', 'since is a number')
        return false
      } 
    }, done())
  )
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
    c = msg(keyC, keyA, [keyB])
  ], done()) 
  done( ()=> db.close( ()=> t.end()) )
})

test('current({live:true}): shadowed revision', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c, n=0

  const done = multicb()

  pull(
    db.revisions.current({live: true}),
    pull.drain( result => {
      n++
      console.log('current', n, result)
      if (n==1) {
        //t.equal(result.value.key, keyA)
        //t.deepEqual(result.value, a)
        t.equal(result.since, 0)
      } else if (n==2) {
        //t.equal(result.value.key, keyC)
        //t.deepEqual(result.value, c)
        t.equal(typeof result.since, 'number', 'since is a number')
      } else if (n==3) {
        //t.notOk(result.value, 'should have no vslue')
        t.equal(typeof result.since, 'number', 'since is a number')
        return false
      }
    }, done())
  )

  db.append([
    a = msg(keyA),
    c = msg(keyC, keyA, [keyB]),
    b = msg(keyB, keyA, [keyA])
  ], done())

  done( err => {
    console.log('we are all done', err)
    db.close( ()=> t.end()) 
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
    b = msg(keyB, keyA, [keyA])
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
              t.equal(result.length, 1, 'should have two entries')
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


