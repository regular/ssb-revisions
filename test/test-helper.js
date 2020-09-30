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

function createDB(filename, cb) {
  if (typeof filename == 'function') {
    cb = filename
    filename = null
  }
  const db =  Flume(OffsetLog(
    filename || '/tmp/test-ssb-revisions-' + ts()+'/bla',
    {blockSize: 1024, codec}
  ))
  
  let done = false
  const _closeHooks = []

  const ssb = {
    close: function(cb) {
      callHooks(db.close, [cb])
      function callHooks(fn, args) {
        if (_closeHooks.length) {
          _closeHooks.shift()(function () {
            callHooks(fn, Array.from(arguments))
          }, args)
        } else {
          fn.apply(this, args)
        }
      }
    },
    ready: ()=> db.ready.value, // this is what secure-scuttlebot turns the obv into, unfortunately
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
  }
  ssb.close.hook = fn=>{
    console.log('close.hook called')
    _closeHooks.push(fn)
  }
  Revisions.init(ssb, {
    // config
    //NO_DEPENDENT_VIEWS: true
  })
}

function test(name, fn) {
  tape(name, t=>{
    createDB( (err, db) => {
      if (err) throw err
      fn(t, db)
    })
  })
}

module.exports = {createDB, test, msg, rndKey}
