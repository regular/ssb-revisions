const pull = require('pull-stream')
const multicb = require('multicb')
const {test, msg, rndKey} = require('./test-helper')
const crypto = require('crypto')


test('Wait for index to catch up', (t, db) => {
  const N = 2000

  append(db, Array(N).fill().map(x=>{
    const keyA = debugKey('keyA')
    const dog = blob('dog')
    const a = msg(keyA)
    a.value.content.owns= dog
    return a
  }), err => {
    t.error(err)
    pull(
      db.revisions.links({to: '&'}),
      //pull.through(console.log),
      pull.collect( (err, results) => {
        t.error(err)
        t.equal(results.length, N)
        db.close(x=> t.end())
      })
    )
  })
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
      //console.log('appending', m)
      db.append(m, cb)
    }),
    pull.collect( (err, seqs)=>{
      if (err) cb(err)
      //console.log(seqs)
      //console.log('appended', seqs.length)
      cb(null, seqs)
    })
  )
}


