/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {

  // DY: _init方法在实例化Vue时执行
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    // DY: 每次实例化一个Vue实例，uid自增
    vm._uid = uid++

    // DY: 性能检测 - 开始
    // DY: 追踪四个场景：组件初始化（component init）、编译（compile）、渲染（render）、打补丁（patch）
    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options
    // if (options && options._isComponent) {
    //   // optimize internal component instantiation
    //   // since dynamic options merging is pretty slow, and none of the
    //   // internal component options needs special treatment.
    //   initInternalComponent(vm, options)
    // } else {
    //   vm.$options = mergeOptions(
    //     resolveConstructorOptions(vm.constructor),
    //     options || {},
    //     vm
    //   )
    // }

    // DY: 通过mergeOptions生成 $options，用于下面一系列的初始化
    vm.$options = mergeOptions(
      // DY: 解析构造者的options，在这里是Vue.options
      resolveConstructorOptions(vm.constructor),
      options || {},
      vm
    )

    /* istanbul ignore else */
    // DY: 拦截模板的属性访问
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    initLifecycle(vm)
    initEvents(vm)
    initRender(vm)
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    // DY: 性能检测 - 结束
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {
  // DY: 拿到构造者的options，在这里是Vue.options
  let options = Ctor.options
  // if (Ctor.super) {
  //   const superOptions = resolveConstructorOptions(Ctor.super)
  //   const cachedSuperOptions = Ctor.superOptions
  //   if (superOptions !== cachedSuperOptions) {
  //     // super option changed,
  //     // need to resolve new options.
  //     Ctor.superOptions = superOptions
  //     // check if there are any late-modified/attached options (#4976)
  //     const modifiedOptions = resolveModifiedOptions(Ctor)
  //     // update base extend options
  //     if (modifiedOptions) {
  //       extend(Ctor.extendOptions, modifiedOptions)
  //     }
  //     options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
  //     if (options.name) {
  //       options.components[options.name] = Ctor
  //     }
  //   }
  // }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
