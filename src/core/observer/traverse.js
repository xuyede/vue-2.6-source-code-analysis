/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)

  // DY: 不是对象，不需要读取子属性
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }

  /**
    const obj1 = {
      data: obj2
    }

    const obj2 = {
      data: obj1
    }
   */

  // DY: 避免循环引用
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }

  // DY: val[i]、val[keys[i]]读取子属性的值，保证子属性能够收集到观察者
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
