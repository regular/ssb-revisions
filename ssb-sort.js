
module.exports = function(links, breakTie) {

  function isFunction (f) { return 'function' === typeof f }

  //get object representing messages in thread.
  function messages (thread) {
    var counts = {}

    for(var i = 0; i < thread.length; i++) {
      var key = thread[i].key
      if(counts[key])
        throw new Error('thread has duplicate message:'+key)
      counts[key] = 1
    }

    return counts
  }

  function contains (set, item) {
    return !!~set.indexOf(item)
  }

  function get (thread, key) {
    for(var i = 0; i < thread.length; i++)
      if(thread[i].key === key) return thread[i]
  }

  function keys (thread) {
    var o = {}
    thread.forEach(function (e) {
      o[e.key] = e.value
    })
    return o
  }

  function isString(s) { return 'string' === typeof s }

  function ancestors(thread, start, each) {
    if(Array.isArray(thread))
      thread = keys(thread)
    start = isString(start) ? start : start.key
    var seen = {}
    function traverse (key) {
      if(seen[key]) return
      var ret
      seen[key] = true
      if(each(thread[key], key)) return true
      return links(thread[key], function (link) {
        if(thread[link]) return traverse(link)
      })
    }

    return traverse(start)
  }

  //messages in thread that are not referenced by another message in the thread.
  function heads (thread) {

    var counts = messages(thread)
    thread.forEach(function (msg) {
      links(msg.value, function (link) {
        counts[link] = 0
      })
    })
    var ary = []
    for(var k in counts) if(counts[k] !== 0) ary.push(k)
    return ary.sort()
  }

  function roots (thread) {

    var counts = messages(thread)

    thread.forEach(function (msg) {
      links(msg.value, function (link) {
        if(counts[link]) counts[msg.key] = 2
      })
    })

    var ary = []
    for(var k in counts) if(counts[k] === 1) ary.push(k)
    return ary
  }

  function sort (thread) {
    var obj = keys(thread)

    function ancestorOf(a, b) {
      return ancestors(obj, a.key, function (_b, k) {
        return b.key === k
      })
    }

    function compare(a, b) {
      return ancestorOf(a, b) ? 1 : ancestorOf(b, a) ? -1 : 0
    }

    return thread.sort(function (a, b) {
      return (
        compare(a, b) || breakTie(a, b)
        /*
        //received timestamp, may not be present
        || a.timestamp - b.timestamp
        //declared timestamp, may by incorrect or a lie
        || a.value.timestamp - b.value.timestamp
        //finially, sort hashes lexiegraphically.
        || (a.key > b.key ? -1 : a.key < b.key ? 1 : 0)
        */
      )
    })
  }

  function children (thread, key) {
    return thread.filter(function (item) {
      return links(item.value, function (link) {
        return link === key
      })
    }).map(function (e) { return e.key })
  }

  function parents (thread, key) {
    var item = get(thread, key)
    if(!item) return null
    var a = []
    console.log(item, key)
    links(item.value, function (link) {
      if(!contains(a, link) && get(thread, link)) a.push(link)
    })
    return a
  }

  //get items which are not in set
  function satisfyable(thread, key, set) {
    return thread.filter(function (item) {
      //if already in the set, skip
      if(contains(set, item.key)) return
      //must have link to key
      var found = false, missing = false
      links(item.value, function (link) {
        if(!get(thread, link)) return //ignore links that go outside the set.
        if(link === key) found = true
        else if(!contains(set, link)) missing = true
      })
      return found && !missing
    }).map(function (item) { return item.key })
  }

  function isBranched (thread) {
    var root = roots(thread), head
    if(root.length > 1) return true
    if((head = heads(thread)).length > 1) return true
    var seen = [], next = root
    return (function recurse (next, seen) {
      if(next == head[0]) return false
      var branch = satisfyable(thread, next, seen)
      if(branch.length > 1) return true
      else return recurse(branch[0], seen.concat(next))
    })(root[0], [])

    return false
  }

  function reduce (thread, reducer, filter, start) {
    if(filter === false)
      filter = function () { return false }
    if(!isFunction(filter)) {
      start = filter
      filter = null
    }

    var kv = {}, heads = {}
    thread.forEach(function (item) { kv[item.key] = item })
    var state = {}
    function recurse(item, f) {
      if(state[item.key]) return
      //recurse first gives topological order
      links(item.value, function (link) {
        if(kv[link] && !state[link]) recurse(kv[link])
      })

      if(!f || !filter || filter(item.value, state)) {
        state[item.key] = reducer(state, item.value)
      }
      else return

      heads[item.key] = true
      //iterate over links again, to check for heads.
      links(item.value, function (link) {
        if(kv[link]) heads[link] = false
      })
    }

    //first calculate ancestors without filter
    [].concat(start||[]).forEach(function (key) {
      recurse(kv[key], false)
    })

    //then expand set, via filter
    thread.forEach(function (e) { return recurse(e, true) })

    //then, contract set...

    var h = {}
    for(var key in heads)
      if(heads[key]) h[key] = state[key]

    return h
  }

  sort.heads = heads
  sort.roots = roots
  sort.ancestors = ancestors
  sort.children = children
  sort.parents = parents

  //get items which are reachable in a thread, given an item, and a seen set.
  sort.satisfyable = satisfyable

  //check if a thread has branches (there are some concurrent updates somewhere)
  sort.isBranched = isBranched
  sort.reduce = reduce
  return sort
}
