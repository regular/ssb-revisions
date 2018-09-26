const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')

test('meta/stats: forks', (t, db) => {
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

  db.append([a, b, c], err => {
    if (err) throw err
    pull(
      db.revisions.heads(keyA, {meta: true}),
      pull.collect( (err, items) => {
        t.notOk(err, 'no error')
        t.equals(items.length, 1)
        t.equals(items[0].meta.forked, true, 'meta indicates a fork')

        db.append(d, err =>{
          if (err) throw err
          pull(
            db.revisions.heads(keyA, {meta: true}),
            pull.collect( (err, items) => {
              t.notOk(err, 'no error')
              t.equals(items.length, 1)
              t.notOk(items[0].meta.forked, 'meta indicates no fork')
              db.close( ()=>{} )
            })
          )
        })
      })
    )
  })
})

test('meta/stats: incomplete', (t, db) => {
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

  db.append([a, c], err => {
    if (err) throw err
    pull(
      db.revisions.heads(keyA, {meta: true}),
      pull.collect( (err, items) => {
        t.notOk(err, 'no error')
        t.equals(items.length, 1)
        t.equals(items[0].meta.incomplete, true, 'meta indicates incomplete chain of revisions')

        db.append(b, err =>{
          if (err) throw err
          pull(
            db.revisions.heads(keyA, {meta: true}),
            pull.collect( (err, items) => {
              t.notOk(err, 'no error')
              t.equals(items.length, 1)
              t.notOk(items[0].meta.incomplete, 'meta indicates completeness')
              db.close( ()=>{} )
            })
          )
        })
      })
    )
  })
})
