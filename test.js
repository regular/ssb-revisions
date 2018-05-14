const tape = require('tape')
const Revisions = require('./')
const crypto = require('crypto')
const OffsetLog = require('flumelog-offset')
const Flume = require('flumedb')
const codec = require('flumecodec/json')
const pull = require('pull-stream')

function Store() {
  let value = {}
  return {
    set: function(data, cb) {
      value = data
      console.log('Store: new value', value)
      cb(null)
    },
    get: function(cb) {
      cb(null, value)
    }
  }
}

function rndKey() {
  return '%' +  crypto.randomBytes(32).toString('base64') + '.sha256'
}

const ts = (function(start){
  return function() {return start++}
})(Date.now())

function msg(key, revisionRoot, revisionBranch) {
  return {
    key,
    value: {
      timestamp: ts(),
      content: {
        revisionRoot,
        revisionBranch 
      }
    }
  }
}

function fresh(cb) {
  const db =  Flume(OffsetLog(
    '/tmp/test-ssb-revisions-' + ts(),
    {blockSize: 1024, codec}
  ))
 
  Revisions.init({
    _flumeUse: (name, view) => {
      db.use(name, view)
      const sv = db[name]
      sv.ready( ()=> {cb(null, db)} )
      return sv
    }
  }, { // config
    revisions: {Store}
  })
}

function test(name, fn) {
  tape(name, t=>{
    fresh( (err, db) => {
      if (err) throw err
      fn(t, db)
    })
  })
}

test('A message without revisions should have no history', (t, db) => {
  const keyA = rndKey()
  db.append(msg(keyA), (err, data) => {
    pull(
      db.revisions.history(keyA),
      pull.collect( (err, result) => {
        t.notOk(err, 'no error')
        t.equal(result.length, 0, 'history should be empty')
        db.close( ()=> t.end())
      })
    )
  })
})

test('Revisions show up in history', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
    c = msg(keyC, keyA, [keyB])
  ], (err, data) => {
    pull(
      db.revisions.history(keyA),
      pull.collect( (err, result) => {
        t.notOk(err, 'no error')
        t.equal(result.length, 2, 'history should have two entries')
        t.deepEqual(result[0], b)
        t.deepEqual(result[1], c)
        db.close( ()=> t.end())
      })
    )
  })
})

test('history({live: true})', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let a, b, c
  let i = 0
  db.append([
    a = msg(keyA),
    b = msg(keyB, keyA, [keyA]),
  ], (err, data) => {
    pull(
      db.revisions.history(keyA, {live: true}),
      pull.drain( rev => {
        i++
        if (i==1) {
          t.deepEqual(rev, b)
          setImmediate( ()=> {
            db.append( c = msg(keyC, keyA, [keyB]), ()=>{} )
          })
          return
        }
        if (i==2) {
          t.deepEqual(rev, c, '2nd rev is c')
          return false
        }
        t.fail('stream too long')
      }, end => {
        t.equal(end, true)
        t.equal(i, 2)
        db.close( ()=> t.end())
      })
    )
  })
})

test('heads({live: true}): fork', (t, db) => {
  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  let i = 0

  const a = msg(keyA)
  const b = msg(keyB, keyA, [keyA])
  const c = msg(keyC, keyA, [keyA])

  db.append([a,c], (err, data) => {
    pull(
      db.revisions.heads(keyA, {live: true}),
      pull.drain( heads => {
        i++
        if (i==1) {
          t.deepEqual(heads, [keyC])
          setImmediate( ()=> {
            db.append( b, ()=>{} )
          })
          return
        }
        if (i==2) {
          t.equals(heads.length, 2, 'There are two heads')
          console.log(heads)
          t.equals(heads[0], keyC, 'Winning head is keyC')
          t.equals(heads[1], keyB, 'keyB is secondary head')
          return false
        }
        t.fail('stream too long')
      }, end => {
        t.equal(end, true)
        t.equal(i, 2)
        db.close( ()=> t.end())
      })
    )
  })
})



