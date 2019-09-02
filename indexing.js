const debug = require('debug')('ssb-revisions indexing')
//const wrap = require('flumedb/wrap')
const wrap = require('./wrap')
const Looper = require('pull-looper')
const pull = require('pull-stream')
const explain = require('explain-error')
const multicb = require('multicb')

module.exports = function(db, log, ready, createStream) {
  const views = {}
  const meta = {}

  const ret = function use(name, createView) {

    if(~Object.keys(views).indexOf(name))
      throw new Error(name + ' is already in use!')

    var sv = createView(log, name)

    views[name] = wrap(sv, log.since, ready)
    views[name].unwrapped = sv
    meta[name] = views[name].meta

    sv.since.once(function build (upto) {
      debug('build: sv.since %d', upto)
      log.since.once(function (since) {
        debug('build: log.since %d', upto)
        if(upto > since) {
          console.log('destroying', name)
          sv.destroy(function () { build(-1) })
        } else {
          const opts = {}
          if (upto !== -1 && upto !== null) opts.since = upto // TODO: call it gt?
          if (upto == -1) opts.cache = false

          debug('Indexing opts are: %s', JSON.stringify(opts))

          pull(
            createStream(opts),
            Looper,
            sv.createSink(function (err) {
              if (db.closed !== true) {
                if(err) {
                  //console.error('error from sink:', err.message)
                  if (err !== true && err.message !== 'aborted') console.error(explain(err, 'view stream error'))
                }
                sv.since.once(build)
              }
            })
          )
        }
      })
    })

    return views[name]
  }
  
  let closed = false
  ret.close = function(cb) {
    if (closed) return cb()
    closed = true
    const done = multicb({pluck:1})
    for(let name in views) {
      if (views[name].close) views[name].close(done())
    }
    done(cb)
  }
  
  return ret
}
