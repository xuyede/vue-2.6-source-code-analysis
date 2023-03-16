/* @flow */
/* globals MutationObserver */

// DY: 
/**
  我们知道任务队列并非只有一个队列，在 node 中更为复杂，
  但总的来说我们可以将其分为 microtask（微任务） 和 (macro)task（宏任务），
  并且这两个队列的行为还要依据不同浏览器的具体实现去讨论，这里我们只讨论被广泛认同和接受的队列执行行为。
  
  当调用栈空闲后每次事件循环只会从 (macro)task 中读取一个任务并执行，
  而在同一次事件循环内会将 microtask 队列中所有的任务全部执行完毕，
  且要先于 (macro)task。
  
  另外 (macro)task 中两个不同的任务之间可能穿插着UI的重渲染，
  那么我们只需要在 microtask 中把所有在UI重渲染之前需要更新的数据全部更新，
  这样只需要一次重渲染就能得到最新的DOM了。
  
  恰好 Vue 是一个数据驱动的框架，如果能在UI重渲染之前更新所有数据状态，
  这对性能的提升是一个很大的帮助，所有要优先选用 microtask 去更新数据状态而不是 (macro)task，
  这就是为什么不使用 setTimeout 的原因，因为 setTimeout 会将回调放到 (macro)task 队列中而不是 microtask 队列，
  所以理论上最优的选择是使用 Promise，当浏览器不支持 Promise 时再降级为 setTimeout
 */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks = []
let pending = false

/**
  created () {
    this.name = 'HcySunYang'
    this.$nextTick(() => {
      this.name = 'hcy'
      this.$nextTick(() => { console.log('第二个 $nextTick') })
    })
  }
 */

// DY: 执行回调队列的全部内容
function flushCallbacks () {

  // DY: 一开始就把 pending 放开，执行 copies[i]() 时如果新的nextTick，就可以
  // 产生一个新的 微任务
  pending = false

  // DY: 复制 callbacks，并在执行遍历前把 callbacks 清空，方便执行 copies[i]() 时
  // 产生的 nextTick 能够正常执行 flushCallbacks
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */

// DY: 有原生的 Promise，优先使用
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
  
  isUsingMicroTask = true
} 

// DY: 使用 MutationObserver
else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} 

// DY: 使用 setImmediate （宏任务）
else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
}

// DY: 使用 settimeout （宏任务）
else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve

  // DY: 把cb进入到 callbacks 队列中
  callbacks.push(() => {
    if (cb) {
      try {

        // DY: 执行 cb
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })

  // DY: 回调队列是否处于等待刷新的状态
  if (!pending) {
    pending = true
    timerFunc()
  }

  // $flow-disable-line
  // DY: 没有传回调函数
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
