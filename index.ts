import type { App, Directive } from 'vue'

// 限制输入数字的选项接口
export interface OnlyNumberOptions {
  max?: number // 最大值限制
  min?: number // 最小值限制
  precision?: number // 小数位数精度限制
  isPositiveNumber?: boolean // 是否为正数(大于0)
  maxText?: string // 超过最大值时的提示文本
  minText?: string // 低于最小值时的提示文本
  integer?: boolean // 是否只允许输入整数
  intergal?: boolean // 兼容旧版本拼写错误
  messageHandler?: (msg: string) => void // 自定义消息提示函数
}

// 缓存每个元素的配置和监听器，防止全局类型污染与内存泄露
const bindingMap = new WeakMap<Element, OnlyNumberOptions>()
const listenersMap = new WeakMap<Element, {
  keypress: (e: KeyboardEvent) => void
  paste: (e: ClipboardEvent) => void
  blur: (e: FocusEvent) => void
}>()

let globalMessageHandler: ((msg: string) => void) | null = null

/**
 * 触发消息提示
 */
const showMessage = (msg: string, binding: OnlyNumberOptions) => {
  if (binding.messageHandler) {
    binding.messageHandler(msg)
    return
  }
  if (globalMessageHandler) {
    globalMessageHandler(msg)
    return
  }

  // 尝试安全调用全局 Element Plus 的 ElMessage
  try {
    const anyGlobal = globalThis as any
    const ElMessage = anyGlobal.ElMessage || anyGlobal.ElementPlus?.ElMessage
    if (ElMessage && typeof ElMessage.info === 'function') {
      ElMessage.info(msg)
      return
    }
  } catch (e) {
    // 忽略异常
  }

  // 降级使用 console.warn
  console.warn(`[v-only-number] ${msg}`)
}

/**
 * 格式化并规范化输入值
 */
const sanitizeValue = (val: string, binding: OnlyNumberOptions): string => {
  if (val === '') {
    return ''
  }

  const min = binding.min ?? -Infinity
  const isPositive = binding.isPositiveNumber || min >= 0

  // 1. 根据是否允许负数过滤字符
  let sanitized = val.replace(isPositive ? /[^\d.]/g : /[^\d.-]/g, '')

  // 2. 规范化负号（只能在最前，且只能有一个）
  if (sanitized.includes('-')) {
    const hasMinus = sanitized.startsWith('-')
    sanitized = sanitized.replace(/-/g, '')
    if (hasMinus) {
      sanitized = '-' + sanitized
    }
  }

  // 3. 规范化小数点（只能有一个）
  if (sanitized.includes('.')) {
    const parts = sanitized.split('.')
    sanitized = parts[0] + '.' + parts.slice(1).join('')
  }

  if (sanitized === '' || sanitized === '-' || sanitized === '.') {
    return ''
  }

  let num = parseFloat(sanitized)
  if (isNaN(num)) {
    return ''
  }

  // 4. 边界范围限制
  const max = binding.max ?? Infinity
  if (num > max) {
    num = max
    if (binding.maxText) {
      showMessage(binding.maxText, binding)
    }
  } else if (num < min) {
    num = min
    if (binding.minText) {
      showMessage(binding.minText, binding)
    }
  }

  // 5. 正数强制大于0校验
  if (binding.isPositiveNumber && num <= 0) {
    return ''
  }

  // 6. 精度格式化
  const isInteger = binding.integer || binding.intergal
  const hasPrecision = typeof binding.precision === 'number' || isInteger
  const precision = isInteger ? 0 : (binding.precision ?? 0)

  if (hasPrecision) {
    return num.toFixed(precision)
  }

  return String(num)
}

/**
 * 设置 DOM 值并同步 Vue 内部状态
 */
const setVal = (el: Element, value: string, vnode: any) => {
  const target = (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement | null
  if (!target) {
    return
  }

  // 更新 DOM 的 value
  target.value = value

  // 触发 input 事件使得 v-model 生效
  target.dispatchEvent(new Event('input', { bubbles: true }))

  // 如果是 Vue 组件，派发 update 消息同步 v-model:value
  if (vnode.component?.emit) {
    vnode.component.emit('update:modelValue', value)
  }
}

/**
 * 绑定事件处理器
 */
const createOnlyNumber = (el: Element, bindingValue: OnlyNumberOptions, vnode: any) => {
  const input = (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement | null
  if (!input) {
    return
  }

  // 缓存当前配置
  bindingMap.set(el, bindingValue)

  // 键盘按键拦截
  const handleKeypress = (e: KeyboardEvent) => {
    const key = e.key

    // 放行系统组合键及功能键
    if (e.ctrlKey || e.metaKey || e.altKey || key.length > 1) {
      return
    }

    const value = input.value
    const binding = bindingMap.get(el) || {}
    const min = binding.min ?? -Infinity
    const isPositive = binding.isPositiveNumber || min >= 0
    const isInteger = binding.integer || binding.intergal
    const precision = isInteger ? 0 : (binding.precision ?? 100)

    // 1. 过滤允许的字符
    const re = isPositive
      ? (precision > 0 ? /\d|\./ : /\d/)
      : (precision > 0 ? /\d|\.|-/ : /\d|-/)

    if (!re.test(key)) {
      e.preventDefault()
      return
    }

    // 2. 负号拦截限制（只能在首位）
    if (key === '-') {
      if (value.includes('-') || input.selectionStart !== 0) {
        e.preventDefault()
        return
      }
    }

    // 3. 小数点拦截限制（只能有一个）
    if (key === '.') {
      if (value.includes('.')) {
        e.preventDefault()
        return
      }
    }

    // 4. 小数精度位数拦截（若光标处于小数点后且超出设定精度限制则拦截）
    if (precision > 0 && value.includes('.')) {
      const dotIndex = value.indexOf('.')
      const cursorIndex = input.selectionStart ?? 0
      if (
        cursorIndex > dotIndex &&
        value.length - 1 - dotIndex >= precision &&
        input.selectionStart === input.selectionEnd
      ) {
        e.preventDefault()
      }
    }
  }

  // 粘贴拦截
  const handlePaste = () => {
    setTimeout(() => {
      const binding = bindingMap.get(el) || {}
      const curValue = input.value
      const sanitized = sanitizeValue(curValue, binding)
      if (curValue !== sanitized) {
        setVal(el, sanitized, vnode)
      }
    }, 0)
  }

  // 失焦格式化
  const handleBlur = () => {
    const binding = bindingMap.get(el) || {}
    const curValue = input.value.trim()
    const sanitized = sanitizeValue(curValue, binding)
    if (curValue !== sanitized) {
      setVal(el, sanitized, vnode)
    }
  }

  const listeners = {
    keypress: handleKeypress,
    paste: handlePaste,
    blur: handleBlur
  }

  input.addEventListener('keypress', handleKeypress)
  input.addEventListener('paste', handlePaste)
  input.addEventListener('blur', handleBlur)

  listenersMap.set(el, listeners)
}

// 指令定义对象
export const onlyNumberDirective: Directive = {
  mounted(el, binding, vnode) {
    createOnlyNumber(el, binding.value || {}, vnode)
  },
  updated(el, binding) {
    // 动态更新配置项缓存
    bindingMap.set(el, binding.value || {})
  },
  unmounted(el) {
    const input = (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement | null
    const listeners = listenersMap.get(el)
    if (input && listeners) {
      input.removeEventListener('keypress', listeners.keypress)
      input.removeEventListener('paste', listeners.paste)
      input.removeEventListener('blur', listeners.blur)
    }
    bindingMap.delete(el)
    listenersMap.delete(el)
  }
}

// 全局注册方法，支持在 setup 时传入全局 options
export const setupOnlyNumberDirective = (
  app: App,
  options?: { messageHandler?: (msg: string) => void }
) => {
  if (options?.messageHandler) {
    globalMessageHandler = options.messageHandler
  }
  app.directive('onlyNumber', onlyNumberDirective)
}
