module.exports = function isOriginal(kv) {
  const content = kv && kv.value && kv.value.content
  if (!content) return false
  if (content.revisionRoot && content.revisionRoot !== kv.key) return false
  if (content.revisionBranch && content.revisionBranch !== kv.key) return false
  return true
}
