import { lerp } from './utils'

export function smoother(props, onUpdate) {
  const keys = Object.keys(props)
  const ret = {}
  const tick = () => {
    window.requestAnimationFrame(tick)
    for (let key of keys) {
      let entry = props[key]
      let get = entry.get || entry
      let tightness = entry.tightness || 0.1
      ret[key] = lerp(+ret[key] || 0, get(), tightness)
    }
    if (onUpdate) { onUpdate(ret) }
  }

  ret.$destroy = () => {
    window.cancelAnimationFrame(tick)
  }

  keys.forEach(k => {
    let entry = props[k]
    let get = entry.get || entry
    ret[k] = get()
  })

  tick()

  return ret
}
