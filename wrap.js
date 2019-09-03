var PullCont = require('pull-cont')
var pull = require('pull-stream')
const debug = require('debug')('wrap')
debug("WRAP")

module.exports = function wrap(sv, logSince, masterSince, isReady) {
  var waiting = []

  var meta = {}
  let db_ready = isReady()

  if (!db_ready) checkReady()

  sv.since(function (upto) {
    if(!db_ready) return
    debug('view reached %d', upto)
    while(waiting.length && waiting[0].seq <= upto) {
      debug('  calling queued cb %d', waiting[0].seq)
      waiting.shift().cb()
    }
  })

  /* secure-scuttlebot replaces flumedb's ready observable
   * with a simple getter. That's why we poll here :(
   */
  function checkReady() {
    db_ready = isReady()
    if(!db_ready) {
      debug('ssb not ready.')
      setTimeout(checkReady, 100)
      return
    }
    var upto = sv.since.value
    debug('database ready, view reached %d', upto)
    if(upto == undefined) return
    while(waiting.length && waiting[0].seq <= upto) {
      debug('  calling queued cb %d', waiting[0].seq)
      waiting.shift().cb()
    }
  }

  function ready(cb) {
    if(db_ready && logSince.value != null && logSince.value === sv.since.value) {
      debug('Calling method immediately, logSince=%d', logSince.value)
      return cb()
    }
    debug('queuing method call for seq %d, sv is at %d, db ready: %b.', logSince.value, sv.since.value, db_ready)
    waiting.push({seq: logSince.value, cb})
  }

  var wrapper = {
    source: function (fn, name) {
      return function (opts) {
        meta[name] ++
        return pull(PullCont(function (cb) {
          ready(function () { cb(null, fn(opts)) })
        }), pull.through(function () { meta[name] ++ }))
      }
    },
    async: function (fn, name) {
      return function (opts, cb) {
        meta[name] ++
        ready(function () {
          fn(opts, cb)
        })
      }
    },
    sync: function (fn, name) {
      //return function (a, b) {
        //meta[name] ++
        return fn//(a, b)
      //}
    }
  }

  var o = {
    ready: ready,
    since: sv.since,
    close: sv.close && wrapper.async(sv.close, 'close'),
    meta: meta
  }
  if(!sv.methods) throw new Error('a stream view must have methods property')

  for(var key in sv.methods) {
    var type = sv.methods[key]
    var fn = sv[key]
    if(typeof fn !== 'function') throw new Error('expected function named:'+key+'of type: '+type)
    //type must be either source, async, or sync
    meta[key] = 0
    o[key] = wrapper[type](fn, key)
  }

  o.methods = sv.methods

  return o
}

