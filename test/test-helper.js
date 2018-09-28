const tape = require('tape')
const crypto = require('crypto')
const OffsetLog = require('flumelog-offset')
const Flume = require('flumedb')
const codec = require('flumecodec/json')
const Revisions = require('../')

function rndKey() {
  return '%' +  crypto.randomBytes(32).toString('base64') + '.sha256'
}

const ts = (function(start){
  return function() {return start++}
})(Date.now())

function msg(key, revisionRoot, revisionBranch) {
  const ret = {
    key,
    value: {
      timestamp: ts(),
      content: { }
    }
  }
  if (revisionRoot) ret.value.content.revisionRoot = revisionRoot
  if (revisionBranch) ret.value.content.revisionBranch = revisionBranch
  return ret
}

function fresh(cb) {
  const db =  Flume(OffsetLog(
    '/tmp/test-ssb-revisions-' + ts()+'/bla',
    {blockSize: 1024, codec}
  ))
  
  let done = false
  Revisions.init({
    ready: db.ready,
    get: db.get,
    _flumeUse: (name, view) => {
      db.use(name, view)
      const sv = db[name]
      sv.ready( ready => {
        if (ready || !done) {
          done = true
          cb(null, db)
        }
      })
      return sv
    }
  }, {
    // config
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

module.exports = {test, msg, rndKey}
