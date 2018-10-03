const Reduce = require('ssb-review-reduce')

module.exports = function() {
  return Reduce(
    9,
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
      console.log(acc)
      return acc
    },
    (kv, seq, newOld) => {
      console.log('STATS MAP', newOld, kv)
      return kv.meta
    },
    null,
    {incomplete: 0, forked: 0}
  )
}
