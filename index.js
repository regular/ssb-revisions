const pull = require('pull-stream')
const defer = require('pull-defer')
const next = require('pull-next')
const CreateView = require('flumeview-level')
const ltgt = require('ltgt')
const multicb = require('multicb')
const debug = require('debug')('ssb-revisions')

const heads = require('./find-heads')
const getRange = require('./get-range')
const Indexing = require('./indexing')
const Stats = require('./indexes/stats')
const Warnings = require('./indexes/warnings')
const Index = require('./indexes/generic')
const Links = require('./indexes/links')

exports.name = 'revisions'
exports.version = require('./package.json').version
exports.manifest = {
  close: 'async',
  get: 'async',
  getLatestRevision: 'async',
  history: 'source',
  heads: 'source',
  updates: 'source',
  stats: 'source',
  warnings: 'source',
  messagesByType: 'source',
  messagesByBranch: 'source',
  links: 'source'
}

const IDXVER = 6

exports.init = function (ssb, config) {
  let _log

  const createView = CreateView(IDXVER, (kv, seq) => {
    const c = kv.value && kv.value.content
    const revisionRoot = c && c.revisionRoot || kv.key
    //console.log('MAP', seq, revisionRoot)
    return [
      ['RS', revisionRoot, seq],
      ['SR', seq, revisionRoot],
      // [B]ranch or [R]oot?
      ['BR', kv.key, isUpdate(kv) ? 'B':'R']
    ]
  })

  const api = ssb._flumeUse('revisions', (log, name) => {
    _log = log
    return createView(log, name)
  })

  // key can be a revRoot or a revision
  // the difference to ssb.get() is that
  // it won't callback until the key is found,
  // hoping that gossipping will make it available
  // eventually
  api.get = function(key, opts, cb) {
    if (typeof opts == 'function') {
      cb = opts
      opts = {}
    }
    opts.values = opts.values !== false
    const meta = {old: true}
    let type
    pull(
      api.read({
        live: true,
        sync: true,
        values: true, // if this is not true, I get {key: undefined, value: undefined} (??)
        keys: true,
        gt: ['BR', key],
        lt: ['BR', key, undefined]
      }),
      pull.filter( kkv => {
        if (kkv.sync) {
          meta.old = false
          return false
        }
        const indexKey = kkv.key
        const [_, __, t] = indexKey
        type = t
        meta.original = t == 'R'
        return true
      }),
      pull.take(1),
      pull.collect( (err, results) => {
        if (err) return cb(err)
        const {value} = results[0]
        if (opts.meta && opts.values) {
          return cb(null, {key, meta, value: value.value})
        }
        if (opts.meta) {
          return cb(null, meta)
        }
        if (opts.values) {
          return cb(null, value.value)
        }
         cb(new Error('invalid options'))
      })
    )
  }

  // key may be original or revision
  // returns kv
  api.getLatestRevision = function(key, opts, cb) {
    if (typeof opts == 'function') {
      cb = opts
      opts = {}
    }
    api.get(key, {meta: true, values: true}, (err, kv) => {
      if (err) return cb(err)
      kv.key = key
      if (!kv.meta.original) {
        // it's a revision
        return cb(null, kv)
      }
      pull(
        api.heads(key, {
          keys: true,
          values: true,
          //seqs: true,
          allowAllAuthors: opts.allowAllAuthors,
          meta: true,
          maxHeads: 1
        }),
        pull.collect((err, items) => {
          if (err) return cb(err)
          if (!items.length) return cb(new Error(`key not found: ${key}`))
          const head = items[0].heads[0]
          cb(null, {
            key: head.key, 
            value: head.value, 
            //seq: head.seq, 
            meta: Object.assign(
              kv.meta, {
                original: head.key == key,
              }, items[0].meta
            )
          })
        })
      )
    })
  }

  api.history = function(revRoot, opts) {
    opts = opts || {}
    // lt gt in opts are seqs
    const o = Object.assign(
      getRange(['RS', revRoot], opts), {
        values: true,
        keys: false,
        seqs: true,
        live: opts.live,
        sync: opts.sync
      }
    )
    return pull(
      api.read(o),
      pull.map(kvv => {
        if (kvv.sync) return kvv
        if (opts.keys == false) delete kvv.value.key
        if (opts.values == false) delete kvv.value.value
        if (opts.seqs) kvv.value.seq = kvv.seq
        return kvv.value
      }),
      stripSingleKey()
    )
  }

  api.heads = function(revRoot, opts) {
    opts = opts || {}
    const {live, sync, allowAllAuthors} = opts
    const revisions = []
    let synced = false
    const state = {}
    let meta
    if (opts.meta) {
      meta = state.meta = {}
    }
    const stream = pull(
      api.history(revRoot, Object.assign(
        {}, opts, {
          values: true,
          keys: true,
          sync: live
        }
      )),
      pull.map( kv => {
        if (kv.sync) {
          synced = true
          return sync ? [state, kv] : [state]
        }
        revisions.push(kv)
        if (!meta) {
          state.heads = heads(revRoot, revisions, {allowAllAuthors}) 
        } else {
          const result = heads(revRoot, revisions, {allowAllAuthors, meta: true}) 
          state.heads = result.heads
          meta.forked = state.heads.length > 1
          meta.incomplete = result.meta.incomplete
          meta.change_requests = result.meta.change_requests
        }
        return !live || (live && synced) ? [state] : null
      }),
      pull.filter(),
      pull.flatten(),
      pull.asyncMap( (result, cb) =>{
        pull(
          pull.values(result.heads),
          opts.maxHeads ? pull.take(opts.maxHeads) : pull.through(),
          pull.through( h => {
            if (opts.keys == false) delete h.key
            if (opts.values == false) delete h.value
          }),
          stripSingleKey(),
          pull.collect( (err, heads) => {
            if (opts.keys == false && opts.values == false) {
              delete result.heads
            } else {
              result.heads = heads
            }
            cb(err, result)
          })
        )
      }),
      stripSingleKey(),
      filterRepeated( JSON.stringify )
    )
    if (live) return stream
    const deferred = defer.source()
    let lastState
    pull(
      stream,
      pull.drain( result => { lastState = result }, err => {
        if (err) return deferred.resolve(pull.error(err))
        deferred.resolve(pull.once(lastState))
      })
    )
    return deferred
  }

  api.updates = function(opts) {
    opts = opts || {}
    const oldSeq = opts.since !== undefined ? opts.since : -1
    const limit = opts.limit || 512 // TODO
    let newSeq = -1
    let i = 0
    return next( ()=> { switch(i++) {
      case 0: 
        //console.log('api.read', oldSeq, '-', api.since.value)
        if (oldSeq == api.since.value) {
          newSeq = oldSeq
          return pull.empty()
        }
        const deferred = defer.source()
        // what revRoots where changed?
        pull(
          api.read({
            gt: ['SR', oldSeq, undefined],
            lte: ['SR', api.since.value, undefined],
            values: false,
            keys: true,
            seqs: false
          }),
          pull.through( ([_, seq, __]) => {
            newSeq = Math.max(newSeq, seq)
          }),
          pull.map(([_, __, revRoot]) => revRoot),
          pull.unique(),
          pull.take(limit),
          pull.collect( (err, revRoots) => {
            if (err) return deferred.resolve(pull.error(err))
            if (newSeq == -1 || newSeq == oldSeq) {
              // we have not seen any revisions
              //console.log('empty set, oldSeq=', oldSeq)
              newSeq = oldSeq
              return deferred.resolve(pull.empty())
            }
            debug('processing updates from %d to %d', oldSeq, newSeq)
            deferred.resolve(
              pull(
                pull.values(revRoots),
                pull.asyncMap( (revRoot, cb) => {
                  const done = multicb({pluck: 1})
                  // TODO: getValueAt takes edits by all authors into account
                  // this needs to be changed to support change requests
                  getValueAt(api, revRoot, oldSeq, done())
                  getValueAt(api, revRoot, newSeq, done())

                  done( (err, values) => {
                    if (err) return cb(err)
                    cb(null, {
                      key: revRoot,
                      old_value: values[0],
                      value: values[1]
                    })
                  })
                })
              )
            )
          })
        )
        return deferred
      case 1: return pull.once({since: newSeq})
    }})
  }

  api.indexingSource = function(opts) {
    opts = opts || {}
    // console.log('called indexingSource', opts)
    let lastSince = opts.since
    let synced = false  
    return next( ()=> {
      if (synced) {
        synced = false
        return pull(
          (()=>{
            let ended
            return function read(end, cb) {
              ended = end || ended
              if (ended) return cb(ended)
              if (api.since.value > lastSince) return cb(true)
              debug('waiting ...')
              // wait for the next time 'since' is set
              api.since.once( ()=> cb(true), false )
            }
          })()
        )
      }
      //console.log('pulling non-live updates since', lastSince)
      return pull(
        api.updates({since: lastSince}),
        pull.map( kvv => {
          if (kvv.since !== undefined) {
            debug('received since %d', kvv.since)
            if (kvv.since == lastSince) {
              //console.log('synced!')
              synced = true
              return null
            } else {
              lastSince = kvv.since
            }
          }
          return kvv
        }),
        pull.filter()
      )
    })
  }

  const addView = Indexing(ssb, _log, ssb.ready, api.since, api.indexingSource)
  api.use = function(name, createView) {
    debug('use %s', name)
    api[name] = addView(name, createView)

    /*
    ssb._flumeUse(name, (log, name) => {
      console.log('Calling fake createView')
      function ViewProxy() {
        this.createSink = function() {
          console.log('Calling fake createSink')
          return pull.drain()
        }
      }
      ViewProxy.prototype = api[name].unwrapped
      return new ViewProxy()
    })
    */
    return api
  }

  const close = api.close
  api.close = function(cb) {
    debug('closing dependent views')
    addView.close(()=>{
      if (close) {
        //console.log('calling orig close')
        close(cb) 
      } else cb()
    })
  }

  api.use('Stats', Stats())
  api.stats = api.Stats.stream

  api.use('Warnings', Warnings())
  api.warnings = api.Warnings.read

  api.use('BranchIndex', Index('branch'))
  api.messagesByBranch= (name, opts) => api.BranchIndex.read(Object.assign({
    gt: [name, null],
    lt: [name, undefined]
  }, opts || {}))

  api.use('TypeIndex', Index('type'))
  api.messagesByType = (name, opts) => api.TypeIndex.read(Object.assign({
    gt: [name, null],
    lt: [name, undefined]
  }, opts || {}))

  api.use('LinkIndex', Links())
  api.links = opts => {
    opts = opts || {}
    let o, m
    if (opts.to && opts.rel) {
      o = {
        gt: ['R', opts.rel, opts.to, null], 
        lt: ['R', opts.rel, opts.to + '~', undefined]
      }
      m = ([_, rel, to, revroot]) => [rel, to, revroot]
    } else if (opts.rel) {
      o = {
        gt: ['R', opts.rel, null, null], 
        lt: ['R', opts.rel, undefined, undefined]
      }
      m = ([_, rel, to, revroot]) => [rel, to, revroot]
    } else if (opts.to) {
      o = {
        gt: ['T', opts.to, null], 
        lt: ['T', opts.to + '~', undefined]
      }
      m = ([_, to, rel, revroot]) => [rel, to, revroot]
    } else {
      o = {
        gt: ['T', null, null], 
        lt: ['T', undefined, undefined]
      }
      m = ([_, to, rel, revroot]) => [rel, to, revroot]
    }
    return pull(
      api.LinkIndex.read(Object.assign(o, opts || {})),
      pull.through(kv => {
        if (kv.key) kv.key = m(kv.key)
      })
    )
  }

  return api
}

// utils ///////

function getValueAt(api, revRoot, at, cb) {
  pull(
    api.heads(revRoot, {
      lte: at,
      keys: true,
      values: true,
      seqs: true,
      meta: true,
      maxHeads: 1,
      allowAllAuthors: true
    }),
    pull.collect((err, items) => {
      if (err) return cb(err)
      if (!items.length) return cb(null, null)
      const head = items[0].heads[0]
      cb(null, {
        key: head.key, 
        value: head.value, 
        seq: head.seq, 
        meta: items[0].meta,
      })
    })
  )
}

function stripSingleKey() {
  return pull.map( kv => {
    if (kv.sync) return kv
    if (Object.keys(kv).length == 1) {
      for(let k in kv) return kv[k]
    }
    return kv
  })
}

function filterRepeated(f) {
  let last
  return pull.filter( x => {
    const y = f(x)
    const ret = last != y
    last = y
    return ret
  })
}

function ary(x) {
  if (x==undefined || x==null) return []
  return Array.isArray(x) ? x : [x]
}

function toMsg(revisionRoot) {
  return function(r) {
    const {key, revisionBranch, timestamp} = r
    return {
      key,
      value: {
        timestamp,
        content: {revisionRoot, revisionBranch}
      }
    }
  }
}

function isUpdate(kv) {
  const content = kv.value && kv.value.content
  if (!content) return false
  const revRoot = content.revisionRoot
  const revBranch = content.revisionBranch
  if (!revRoot || !revBranch) return false
  if (revRoot == kv.key) return false
  return true
}
