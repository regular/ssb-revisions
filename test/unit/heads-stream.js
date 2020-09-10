const test = require('tape')
const pull = require('pull-stream')
const HeadsStream = require('../../reduce/heads-stream')
const {rndKey, msg} = require('../test-helper')

test('orginal only, default options', t => {
  const keyA = rndKey()
  const a = msg(keyA)

  const historyStream = (revRoot, opts) => {
    t.equal(revRoot, keyA, 'asks for the right revRoot')
    return pull.values([a])
  }

  const headsStream = HeadsStream(historyStream)

  pull(
    headsStream(keyA),
    pull.collect( (err, items) => {
      t.equal(items.length, 1, 'one item in stream')
      const item = items[0]
      t.true(Array.isArray(item), 'item is an array')
      t.equal(item.length, 1, 'one head')
      t.equal(item[0], a, 'head is the original message')
      t.end()
    })
  )
})
