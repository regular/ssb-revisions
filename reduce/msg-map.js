module.exports = function(revisions) {
  return revisions.reduce( (acc, kv) => (acc[kv.key] = kv, acc), {})
}
