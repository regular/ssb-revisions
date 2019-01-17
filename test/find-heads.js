const test = require('tape')
const heads = require('../find-heads')
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

  t.deepEqual(
    heads(keyA, [a,b,c]),
    [c,b]
  )
  t.deepEqual(
    heads(keyA, [a,b,c], {meta: true}),
    {
      heads: [c,b],
      meta: {
        change_requests: 0,
        incomplete: false
      }
    }
  )
  t.end()
})

test('fork, two authors',t => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()

  const a = authorMsg('alice', keyA)
  const b = authorMsg('alice', keyB, keyA, [keyA])
  const c = authorMsg('bob', keyC, keyA, [keyA]) // fork

  t.deepEqual(
    heads(keyA, [a,b,c]),
    [b]
  )
  t.deepEqual(
    heads(keyA, [a,b,c], {meta: true}),
    {
      heads: [b],
      meta: {
        change_requests: 1,
        incomplete: false
      }
    }
  )
  t.end()
})

test('no original',t => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()

  const a = authorMsg('alice', keyA)
  const b = authorMsg('alice', keyB, keyA, [keyA])
  const c = authorMsg('bob', keyC, keyA, [keyA]) // fork

  t.deepEqual(
    heads(keyA, [b,c], {allowAllAuthors: true}),
    [c, b]
  )
  t.deepEqual(
    heads(keyA, [b,c]),
    []
  )
  t.deepEqual(
    heads(keyA, [b,c], {meta: true}),
    {
      heads: [],
      meta: {
        change_requests: 0,
        incomplete: true
      }
    }
  )
  t.end()
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

  t.deepEqual(
    heads(keyA, [a,b,c,d], {allowAllAuthors: true}),
    [d, b]
  )
  t.deepEqual(
    heads(keyA, [a,b,c,d]),
    [a]
  )
  t.deepEqual(
    heads(keyA, [a,b,c,d], {meta: true}),
    {
      heads: [a],
      meta: {
        change_requests: 3,
        incomplete: false
      }
    }
  )
  t.end()
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

  t.deepEqual(
    heads(keyA, [a,b,c,d,e], {allowAllAuthors: true}),
    [e]
  )
  t.deepEqual(
    heads(keyA, [a,b,c,d,e]),
    [e]
  )
  t.deepEqual(
    heads(keyA, [a,b,c,d,e], {meta: true}),
    {
      heads: [e],
      meta: {
        change_requests: 0,
        incomplete: false
      }
    }
  )
  t.end()
})
