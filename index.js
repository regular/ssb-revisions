const pull = require('pull-stream')
const next = require('pull-next')
const debug = require('debug')('ssb-revisions')
const CreateView = require('flumeview-level')

const {stripSingleKey, filterRepeated} = require('./lib/stream-formatting.js')

const HistoryStream = require('./history-stream')
const HeadsStream = require('./reduce/heads-stream')
const GetLatestRevision = require('./reduce/get-latest-revision')
const UpdatesStream = require('./updates-stream')

const findHeads = require('./reduce/find-heads')

const Indexing = require('./indexing')
const Index = require('./indexes/generic')
const Stats = require('./indexes/stats')
const Warnings = require('./indexes/warnings')
const Links = require('./indexes/links')

exports.name = 'revisions'
exports.version = require('./package.json').version
exports.manifest = {
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
  const {NO_DEPENDENT_VIEWS} = config // for testing and debuging

  const createView = CreateView(IDXVER, (kv, seq) => {
    const c = kv.value && kv.value.content
    const revisionRoot = c && c.revisionRoot || kv.key
    //console.log('MAP', seq, revisionRoot)
    return [
      ['RS', revisionRoot, seq],
      ['SR', seq, revisionRoot],
      // revision[B]ranch or revision[R]oot?
      ['BR', kv.key, isUpdate(kv) ? 'B':'R']
    ]
  })

  const api = ssb._flumeUse('revisions', (log, name) => {
    _log = log
    return createView(log, name)
  })

  const streamHistory = HistoryStream(api.read)
  const streamHeads = HeadsStream(streamHistory)
  const streamUpdates = UpdatesStream(api.read, api.since, streamHeads)

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

  api.history = streamHistory

  // reducing APIs
  api.heads = streamHeads
  api.getLatestRevision = GetLatestRevision(api.get, streamHeads)

  api.updates = streamUpdates

  api.indexingSource = function(opts) {
    opts = opts || {}
    // console.log('called indexingSource', opts)
    let lastSince = opts.since
    const {validator, allowAllAuthors} = opts
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
        api.updates({since: lastSince, validator, allowAllAuthors}),
        pull.map( kvv => {
          if (kvv.since !== undefined) {
            debug('received since %d', kvv.since)
            if (kvv.since == lastSince) {
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
    return api
  }

  ssb.close.hook( function(fn, args) {
    debug('closing dependent views')
    addView.close(()=>{
      fn.apply(this, args)
    })
  })

  if (!NO_DEPENDENT_VIEWS) {
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
  }
  return api
}

// utils ///////

function isUpdate(kv) {
  const content = kv.value && kv.value.content
  if (!content) return false
  const revRoot = content.revisionRoot
  const revBranch = content.revisionBranch
  if (!revRoot || !revBranch) return false
  if (revRoot == kv.key) return false
  return true
}
