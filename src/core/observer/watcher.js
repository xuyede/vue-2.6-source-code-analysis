/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */

// DY: watcher的原理是通过对被观察的目标求值，触发数据属性的get，从而收集依赖
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    // DY: 当前的实例
    vm: Component,
    // DY: 被观察的目标
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    // DY: 是否为渲染函数的watcher（在 mountComponent 创建的）
    isRenderWatcher?: boolean
  ) {
    // DY: 保存vm，指明这个观察者是属于哪一个组件的
    this.vm = vm

    // DY: 如果是渲染函数的watcher，把当前watcher保存到 _watcher
    if (isRenderWatcher) {
      vm._watcher = this
    }

    // DY: 属于该组件的观察者都会被添加到该组件的 _watchers 数组中
    // 包括渲染函数的观察者和非渲染函数的观察者
    vm._watchers.push(this)

    // options
    if (options) {
      // DY: 当前观察者是否是深度观测
      this.deep = !!options.deep

      // DY: 当前观察者是开发者定义的还是框架定义的
      // 除了内部定义的观察者(如：渲染函数的观察者、计算属性的观察者等)之外，所有观察者都被认为是开发者定义的
      this.user = !!options.user

      // DY: 当前观察者是否是计算属性的观察者
      this.lazy = !!options.lazy

      // DY: 当数据改变时，当前观察者是否同步求值并则执行回调
      this.sync = !!options.sync

      // DY: 当数据变化后，触发更新前，执行的钩子函数
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }

    this.cb = cb
    this.id = ++uid // uid for batching

    // DY: 当前观察者是否激活
    this.active = true
    this.dirty = this.lazy // for lazy watchers

    // DY: 存储的总是当次求值所收集到的 Dep 实例对象
    this.newDeps = []
    this.newDepIds = new Set()

    // DY: 存储的总是上一次求值过程中所收集到的 Dep 实例对象
    this.deps = []
    this.depIds = new Set()
    

    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''

    // parse expression for getter
    // DY: 处理完的 getter 始终为一个函数
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }

    // DY: 如果不是计算属性，直接求值
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  // DY: 求值，触发get
  get () {

    // DY: 把当前的 watcher 给到 dep.target
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // DY: 执行getter，触发里面使用数据的get
      // 这一步过后，getter绑定的数据的 dep 已经收集到了当前 watcher
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }

      // DY: 把当前 watcher 从 dep.target 移除
      popTarget()

      // DY: 每次求值完后，处理当前 watcher 和 dep的依赖
      this.cleanupDeps()
    }

    // DY: 返回被观察目标的值给到 this.value
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id

    // DY: 一次求值中，读取多个相同的数据，使用 newDepIds 避免收集重复依赖
    if (!this.newDepIds.has(id)) {

      // DY: 如果当前watcher没有被收集过，保存id和dep实例
      this.newDepIds.add(id)
      this.newDeps.push(dep)

      // DY: 当数据变化时，重新求值的时候，使用 depIds 避免收集重复依赖
      if (!this.depIds.has(id)) {

        // DY: 把当前 watcher 收集到dep中
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  // DY: 把newDepIds赋值给depIds，把newDeps赋值给deps
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      // DY: 当前 watcher 的上一次求值收集的 dep
      const dep = this.deps[i]

      // DY: 如果当前watcher上一次求值收集的 dep 不在当次求值收集的 dep 列表中
      // 移除掉
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }

    // DY: 保存depIds的副本
    let tmp = this.depIds
    // DY: 把newDepIds赋值给depIds
    this.depIds = this.newDepIds
    // DY: 把depIds的副本赋值给newDepIds
    this.newDepIds = tmp
    // DY: 清空newDepIds
    this.newDepIds.clear()

    // DY: 保存deps的副本
    tmp = this.deps
    // DY: 把newDeps赋值给deps
    this.deps = this.newDeps
    // DY: 把deps的副本赋值给newDeps
    this.newDeps = tmp
    // DY: 清空newDeps
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {

      // DY: 重新求值（对于渲染函数的watcher来说，等价于重新执行渲染函数）
      const value = this.get()

      // DY: 对于渲染函数的watcher来说, get返回的值永远是 undefined，不会执行if里面的内容
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value

        // DY: 通过 watch 选项 或 $watch 函数定义的观察者
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {

          // DY: 执行watcher的回调函数，给出新旧值
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
