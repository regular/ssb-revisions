const Reduce = require('ssb-review-reduce')

module.exports = Reduce(
  6,
  (acc, newMeta, newSeq, oldMeta, oldSeq) => {
    console.log('newMeta', newMeta)
    if (newMeta.incomplete && !(oldMeta && oldMeta.incomplete))
      acc.incomplete++
    if (!newMeta.incomplete && oldMeta && oldMeta.incomplete)
      acc.incomplete--
    if (newMeta.forked && !(oldMeta && oldMeta.forked))
      acc.forked++
    if (!newMeta.forked && oldMeta && oldMeta.forked)
      acc.forked--
    return acc
  },
  kv => kv.meta, 
  null,
  {incomplete: 0, forked: 0}
)
