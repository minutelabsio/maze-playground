import { lerp } from './utils'

export function smoother(props, onUpdate) {
  const keys = Object.keys(props)
  const ret = {}
  let stop = false
  const tick = () => {
    if (stop){ return }
    for (let key of keys) {
      let entry = props[key]
      let get = entry.get || entry
      let tightness = entry.tightness || 0.1
      ret[key] = lerp(+ret[key] || 0, get(), tightness)
    }
    if (onUpdate) { onUpdate(ret) }
    window.requestAnimationFrame(tick)
  }

  ret.$destroy = () => {
    stop = true
  }

  keys.forEach(k => {
    let entry = props[k]
    let get = entry.get || entry
    ret[k] = get()
  })

  tick()

  return ret
}
