/* @flow */
// DY: 选项的合并
import config from '../config'
import { warn } from './debug'
import { set } from '../observer/index'
import { unicodeRegExp } from './lang'
import { nativeWatch, hasSymbol } from './env'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
// DY: 默认为config中的策略，用户不配置的话，是空对象
const strats = config.optionMergeStrategies

/**
 * Options with restrictions
 */
if (process.env.NODE_ENV !== 'production') {

  // DY: 选项 el、propsData 的合并策略
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}

/**
 * Helper that recursively merges two data objects together.
 */
// DY: data合并策略的逻辑，把from的值合并到to
function mergeData (to: Object, from: ?Object): Object {
  if (!from) return to
  let key, toVal, fromVal

  // DY: 拿到from对象的所有key
  const keys = hasSymbol
    ? Reflect.ownKeys(from)
    : Object.keys(from)

  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    // in case the object is already observed...
    if (key === '__ob__') continue

    // DY: 获取to对应key的值
    toVal = to[key]

    // DY: 获取from对应key的值
    fromVal = from[key]

    // DY: 如果to中没有key，把from对应key的值给to
    if (!hasOwn(to, key)) {
      set(to, key, fromVal)
    } else if (
      // DY: 如果toVal和fromVal为不同的对象，递归处理里面的值
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal)
    }
  }
  return to
}

/**
 * Data
 */
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {

  // DY: 处理子组件的data合并
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.

    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}

// DY: 选项 data 的合并策略
// 且经过处理后的data必定是一个函数，函数返回一个对象
strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {

  // DY: 处理子组件的data
  if (!vm) {
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    return mergeDataOrFn(parentVal, childVal)
  }

  return mergeDataOrFn(parentVal, childVal, vm)
}

/**
 * Hooks and props are merged as arrays.
 */
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  const res = childVal
    // DY: 有childVal，判断是否是parentVal
    ? parentVal
      // DY: 有parentVal，把childVal合并到parentVal中
      ? parentVal.concat(childVal)

      // DY: 没有parentVal，判断childVal是不是一个数组
      : Array.isArray(childVal)

        // DY: childVal是数组的话，返回childVal 
        ? childVal

        // DY: childVal不是数组的话，包装成数组返回
        : [childVal]
    
    // DY: 没有childVal，返回parentVal
    : parentVal

  return res
    ? dedupeHooks(res)
    : res
}

function dedupeHooks (hooks) {
  const res = []
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i])
    }
  }
  return res
}

// DY: 生命周期钩子选项的合并策略
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  const res = Object.create(parentVal || null)
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)

    // DY: 合并后的res
    /**
      对于components
      res = {
        customComponent

        // 原型
        __proto__: {
          KeepAlive,
          Transition,
          TransitionGroup
        }
      }
    */
    return extend(res, childVal)
  } else {
    return res
  }
}

// DY: 资源(assets)选项的合并策略
ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
// DY: 选项 watch 的合并策略
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined

  /* istanbul ignore if */
  if (!childVal) return Object.create(parentVal || null)
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }

  if (!parentVal) return childVal

  const ret = {}
  extend(ret, parentVal)

  // DY: 合并处理成一个{ x: any[] | any }
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  return ret
}

/**
 * Other object hashes.
 */
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }

  if (!parentVal) return childVal

  const ret = Object.create(null)
  extend(ret, parentVal)
  if (childVal) extend(ret, childVal)
  return ret
}

// DY: provid 合并和data一致
strats.provide = mergeDataOrFn

/**
 * Default strategy.
 */
// DY: 默认合并策略，优先使用传进来的 options 对应项的值
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names
 */
function checkComponents (options: Object) {
  for (const key in options.components) {
    validateComponentName(key)
  }
}

export function validateComponentName (name: string) {
  if (!new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'should conform to valid custom element name in html5 specification.'
    )
  }

  // DY: isBuiltInTag 检测注册的组件名是否为内置的标签 slot component
  // DY: config.isReservedTag 是否是自定义的保留标签 svg html
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
// DY: 在使用props的时候，会出现不同形式的写法，如数组，对象。在该函数中处理成对象的形式
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props
  if (!props) return
  const res = {}
  let i, val, name
  if (Array.isArray(props)) {
    i = props.length
    while (i--) {
      val = props[i]

      // DY: 数组的元素必须是字符串 
      /**
        props: ['someData']

        res = {
          someData: {
            type: null
          }
        }
      */
      if (typeof val === 'string') {
        name = camelize(val)
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {
    
    // DY: 对象有两种写法
    /**
      props: {
        someData1: Number,
        someData2: {
          type: number,
          default: 1
        }
      }

      res = {
        someData1: {
          type: Number
        },
        someData2: {
          type: number,
          default: 1
        }
      }
    */
    for (const key in props) {
      val = props[key]
      name = camelize(key)
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  options.props = res
}

/**
 * Normalize all injections into Object-based format
 */
function normalizeInject (options: Object, vm: ?Component) {
  const inject = options.inject
  if (!inject) return
  const normalized = options.inject = {}
  if (Array.isArray(inject)) {
    // DY: inject使用数组接收
    /**
      inject: ['data1', 'data2']

      normalized = {
        data1: {
          from: 'data1'
        },
        data2: {
          from: 'data2'
        }
      }
    */
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    // DY: inject使用对象接收
    /**
      let data1 = 'data1'
      inject: {
        data1,
        d2: 'data2',
        data3: { someProperty: 'someValue' }
      }

      normalized = {
        data1: { from: 'data1' },
        d2: { from: 'data2' },
        data3: { from: 'data3', someProperty: 'someValue' }
      }
    */
    for (const key in inject) {
      const val = inject[key]
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 */
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  if (dirs) {

    // DY: directives有对象和函数的写法，在这里统一处理成对象的形式
    /**
      directives: {
        test1: {
          bind: function () {
            console.log('v-test1')
          }
        },
        test2: function () {
          console.log('v-test2')
        }
      }

      directives: {
        test1: {
          bind: function () {
            console.log('v-test1')
          }
        },
        test2: {
          bind: function () {
            console.log('v-test2')
          },
          update: function () {
            console.log('v-test2')
          }
        }
      }
    */
    for (const key in dirs) {
      const def = dirs[key]
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
export function mergeOptions (
  parent: Object,
  child: Object,

  // DY: 通过vm是否传值可以知道 mergeOptions是在实例化时调用(使用 new 操作符走 _init 方法)
  // 还是在继承时调用(Vue.extend)
  vm?: Component
): Object {
  /**
    parent = {
      components: {
        KeepAlive
        Transition,
          TransitionGroup
      },
      directives:{
          model,
            show
      },
      filters: Object.create(null),
      _base: Vue
    }

    child = {
      el: '#app',
      data: {
        test: 1
      }
    }
   */

  if (process.env.NODE_ENV !== 'production') {
    // DY: 校验传进来的组件是否合规
    checkComponents(child)
  }

  if (typeof child === 'function') {
    child = child.options
  }

  // DY: 规范化 props
  normalizeProps(child, vm)

  // DY: 规范化 inject
  normalizeInject(child, vm)

  // DY: 规范化 directives
  normalizeDirectives(child)

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.

  // DY: 如果不是Vue.extend生成的子类，才会合并extends和mixin
  if (!child._base) {
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm)
    }
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm)
      }
    }
  }

  const options = {}
  let key
  for (key in parent) {
    mergeField(key)
  }
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }

  // DY: 使用预设的合并策略处理自带的options和传进来的options
  function mergeField (key) {
    const strat = strats[key] || defaultStrat

    // DY: 如果策略函数中拿不到 vm 参数，那么处理的就是子组件的选项
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  const assets = options[type]
  // check local registration variations first
  if (hasOwn(assets, id)) return assets[id]
  const camelizedId = camelize(id)
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // fallback to prototype chain
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}
