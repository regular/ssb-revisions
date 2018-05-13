const test = require('tape')
const Revisions = require('./')
const crypto = require('crypto')
const OffsetLog = require('flumelog-offset')
const Flume = require('flumedb')
const codec = require('flumecodec/json')
const pull = require('pull-stream')

function rndKey() {
  return '%' +  crypto.randomBytes(32).toString('base64') + '.sha256'
}

function msg(key, revisionRoot, revisionBranch) {
  return {
    key,
    value: {
      content: {
        revisionRoot,
        revisionBranch 
      }
    }
  }
}

function fresh() {
  const db =  Flume(OffsetLog(
    '/tmp/test-ssb-revisions-' + rndKey(),
    {blockSize: 1024, codec}
  ))
  return {db, revs: Revisions.init({
    _flumeUse: (name, view) => {
      db.use(name, view)
      return db[name]
    }
  })}
}

test('A message without revisions should have no history', t => {
  const {db, revs} = fresh()

  const keyA = rndKey()
  db.append(msg(keyA), (err, data) => {
    pull(
      revs.history(keyA),
      pull.collect( (err, result) => {
        t.notOk(err, 'no error')
        t.equal(result.length, 0, 'history should be empty')
        db.close( ()=> t.end())
      })
    )
  })
})

test('Revisions show up in history', t => {
  const {db, revs} = fresh()

  const keyA = rndKey()
  const keyB = rndKey()
  const keyC = rndKey()
  db.append([
    msg(keyA),
    msg(keyB, keyA, [keyA]),
    msg(keyC, keyA, [keyB])
  ], (err, data) => {
    pull(
      revs.history(keyA),
      pull.collect( (err, result) => {
        t.notOk(err, 'no error')
        t.equal(result.length, 2, 'history should have two entries')
        t.end()
      })
    )
  })
})

