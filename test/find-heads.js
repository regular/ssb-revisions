const test = require('tape')
const heads = require('../reduce/find-heads')
const {msg, rndKey} = require('./test-helper')

function authorMsg(author, ...args) {
  const m = msg(...args)
  m.value.author = author
  return m
}

test('fork, one author',t => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()

  const a = authorMsg('alice', keyA)
  const b = authorMsg('alice', keyB, keyA, [keyA])
  const c = authorMsg('alice', keyC, keyA, [keyA]) // fork

  t.plan(4)

  heads(keyA, [a,b,c], (err, result) =>{
    t.error(err)
    t.deepEqual(result, [c,b])
  })

  heads(keyA, [a,b,c], {meta: true}, (err, result) => {
    t.error(err)
    t.deepEqual( result, {
      heads: [c,b],
      meta: {
        change_requests: 0,
        incomplete: false
      }
    })
  })
})

test('fork, two authors',t => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()

  const a = authorMsg('alice', keyA)
  const b = authorMsg('alice', keyB, keyA, [keyA])
  const c = authorMsg('bob', keyC, keyA, [keyA]) // fork

  t.plan(4)

  heads(keyA, [a,b,c], (err, result) => {
    t.error(err)
    t.deepEqual(result,
      [b]
    )
  })

  heads(keyA, [a,b,c], {meta: true}, (err, result)=>{
    t.error(err)
    t.deepEqual(result, {
      heads: [b],
      meta: {
        change_requests: 1,
        incomplete: false
      }
    })
  })
})

test('no original',t => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()

  const a = authorMsg('alice', keyA)
  const b = authorMsg('alice', keyB, keyA, [keyA])
  const c = authorMsg('bob', keyC, keyA, [keyA]) // fork

  t.plan(6)

  heads(keyA, [b,c], {allowAllAuthors: true}, (err, result) =>{
    t.error(err)
    t.deepEqual(result, [c, b])
  })

  heads(keyA, [b,c], (err, result) => {
    t.error(err)
    t.deepEqual(result, [])
  })

  heads(keyA, [b,c], {meta: true}, (err, result) => {
    t.error(err)
    t.deepEqual(result, {
      heads: [],
      meta: {
        change_requests: 0,
        incomplete: true
      }
    })
  })
})

test('many change requests',t => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()

  const a = authorMsg('alice', keyA)
  const b = authorMsg('charly', keyB, keyA, [keyA])
  const c = authorMsg('bob', keyC, keyA, [keyA]) // fork
  const d = authorMsg('bob', keyD, keyA, [keyC]) 

  t.plan(6)

  heads(keyA, [a,b,c,d], {allowAllAuthors: true}, (err, result) =>{
    t.error(err)
    t.deepEqual(result, [d, b])
  })
  heads(keyA, [a,b,c,d], (err, result) =>{
    t.error(err)
    t.deepEqual(result, [a])
  })
  heads(keyA, [a,b,c,d], {meta: true}, (err, result) =>{
    t.error(err)
    t.deepEqual(result, {
      heads: [a],
      meta: {
        change_requests: 3,
        incomplete: false
      }
    })
  })
})

test('merge many change requests',t => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()
  const keyE = rndKey()

  const a = authorMsg('alice', keyA)
  const b = authorMsg('charly', keyB, keyA, [keyA])
  const c = authorMsg('bob', keyC, keyA, [keyA]) // fork
  const d = authorMsg('bob', keyD, keyA, [keyC]) 
  const e = authorMsg('alice', keyE, keyA, [keyD, keyB])  // merge bob's and charly's heads 

  t.plan(6)

  heads(keyA, [a,b,c,d,e], {allowAllAuthors: true}, (err, result) =>{
    t.error(err)
    t.deepEqual(result, [e])
  })
  heads(keyA, [a,b,c,d,e], (err, result) =>{
    t.error(err)
    t.deepEqual(result, [e])
  })
  heads(keyA, [a,b,c,d,e], {meta: true}, (err, result) =>{
    t.error(err)
    t.deepEqual(result, {
      heads: [e],
      meta: {
        change_requests: 0,
        incomplete: false
      }
    })
  })
})
