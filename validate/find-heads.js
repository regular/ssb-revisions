const DefaultValidator = require('./default-validator')

module.exports = function getValidHeads(revisionRoot, revisions, opts, cb) {
  if (typeof opts == 'function') {
    cb = opts
    opts = {}
  }
  opts = opts || {}
  const {meta} = opts
  const validator = opts.validator || DefaultValidator(opts.allowAllAuthors)

  const msgMap = revisions.reduce( (acc, kv) => (acc[kv.key] = kv, acc), {})
  validator(revisionRoot, msgMap, {meta: opts.meta}, cb)
}
