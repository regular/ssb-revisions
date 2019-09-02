const {isMsgId, isBlobId, isFeedId} = require('ssb-ref')
const traverse = require('traverse')
const Index = require('ssb-review-level')
const debug = require('debug')('ssb-revisions:links')
 
module.exports = function() {
  return Index(1, function map (kv) {
    const {key, value} = kv
    debug('mapping %s', key)
    let content = value && value.content || {}

    const revisionRoot = (value && value.content && value.content.revisionRoot) || key

    const links = traverse(content).reduce(function (acc, x) {
      if (this.isLeaf) {
        if (isMsgId(x) || isBlobId(x) || isFeedId(x)) {
          if (!['revisionRoot', 'revisionBranch'].includes(this.path[0])) {
            acc.push([this.path.join('.'), x])
          }
        }
      }
      return acc
    }, [])

    const ret = links.map(([rel, x]) => ['T', x, rel, revisionRoot]).concat(
                links.map(([rel, x]) => ['R', rel, x, revisionRoot])
    )
    debug('return %O', ret)
    return ret
  })
}
