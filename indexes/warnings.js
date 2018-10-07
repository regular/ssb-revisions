const Index = require('ssb-review-level')
 
module.exports = function() {
  return Index(2, function map(kv) {
    const {meta, key, value} = kv
    const entries = []
    const revisionRoot = (value && value.content && value.content.revisionRoot) || key
    if (meta.incomplete) entries.push(['I', revisionRoot])
    if (meta.forked) entries.push(['F', revisionRoot])
    return entries
  })
}
