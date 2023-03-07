/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

// DY: 获取原来数组的 prototype
const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]

  // DY: 给 arrayMethods 定义每一个 method 的代理函数
  def(arrayMethods, method, function mutator (...args) {

    // DY: 先执行原来的数组方法
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted

    // DY: 新增操作，新的元素没有响应式，需要变成响应式
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }

    // DY: 把新增的元素变为响应式（inserted）
    if (inserted) ob.observeArray(inserted)
    // notify change
    ob.dep.notify()
    return result
  })
})
