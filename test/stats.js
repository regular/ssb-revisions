const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')

/*
test('stats: forks', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  const keyD = rndKey()

  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyA]) // fork
  const d = msg(keyD, keyA, [keyB, keyC]) // merge

  let i = 0

  pull(
    db.revisions.stats({live: true}),
    pull.drain( s=> {
      console.log(s)
      t.equals(s.revisions, [0,1,2,3][i], 'revisions')
      t.equals(s.forks, [0,0,1,0][i], 'forks')
      t.equals(s.incomplete, [0,0,0,0][i], 'incomplete')
      i++
    }, err => {
      t.notOk(err, 'no error')
      t.equals(i, 4, 'four status updates')
      db.close( ()=> t.end())
    })
  )
})

test('stats: incomplete', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()

  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyB])

  let i = 0

  pull(
    db.revisions.stats({live: true}),
    pull.drain( s=> {
      console.log(s)
      t.equals(s.incomplete, [0,1,0][i])
      t.equals(s.forks, [0,0,0][i])
      i++
    }, err => {
      t.notOk(err, 'no error')
      t.equals(i, 3, 'three status updates')
      db.close( ()=> t.end())
    })
  )
})
*/
