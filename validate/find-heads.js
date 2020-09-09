const DefaultValidator = require('./default-validator')

module.exports = function getValidHeads(revisionRoot, revisions, opts, cb) {
  if (typeof opts == 'function') {
    cb = opts
    opts = {}
  }
  opts = opts || {}
  const {meta} = opts
  const validator = opts.validator || DefaultValidator(opts.allowAllAuthors)

  validator(revisionRoot, revisions, {meta: opts.meta}, cb)
}
