const test = require('tape')
const gr = require('../lib/get-range')

test('No range specified', t => {
  const r= gr([1], {})
  t.deepEqual(r, {gte: [1], lt: [1, undefined]})
  t.end()
})

test('gt, gte', t => {
  const gtr= gr([1], {gt: 12})
  t.deepEqual(gtr, {gt: [1,12], lt: [1, undefined]})

  const gter= gr([1], {gte: 12})
  t.deepEqual(gter, {gte: [1,12], lt: [1, undefined]})

  t.end()
})

test('gt=0', t => {
  const gtr= gr([1], {gt: 0})
  t.deepEqual(gtr, {gt: [1,0], lt: [1, undefined]})
  t.end()
})

test('lt, lte', t => {
  const ltr= gr([1], {lt: 12})
  t.deepEqual(ltr, {gte: [1], lt: [1, 12]})

  const lter= gr([1], {lte: 12})
  t.deepEqual(lter, {gte: [1], lte: [1, 12]})

  t.end()
})

test('gt & lte', t => {
  const r= gr([1], {gt: 10, lte: 12})
  t.deepEqual(r, {gt: [1,10], lte: [1, 12]})
  t.end()
})
