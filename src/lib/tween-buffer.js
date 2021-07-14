import { lerp, rescale } from "./utils"

export class TweenBuffer {
  constructor(state, duration = 1000) {
    this.state = state
    this.duration = duration
    this.paused = false
    this.easeFn = (k) => k
    this.clear()
    return this
  }

  easing(e) {
    this.easeFn = e
    return this
  }

  tick(dt) {
    if (this.paused || !this.endTime) {
      return this
    }

    this.time += dt

    let acc = Object.assign({}, this.startState)
    this.buffer = this.buffer.filter((s) => {
      let k = rescale(s.start, s.end, this.time, true)
      k = this.easeFn(k)
      acc = Object.entries(acc).reduce((a, [key, from]) => {
        let to = s.ds[key]
        a[key] += lerp(0, to, k, true)
        return a
      }, acc)
      if (s.end >= this.time) {
        return true
      } else {
        this.startState = Object.assign({}, s.state)
        return false
      }
    })

    Object.keys(this.state).forEach((key) => {
      this.state[key] = acc[key]
    })

    if (this.time >= this.endTime) {
      this.clear()
    }

    return this
  }

  to(newState, delay = 0, duration = false) {
    if (duration === false) {
      duration = this.duration
    }

    if (!this.startState) {
      this.startState = Object.assign({}, this.state)
    }

    let start = this.time + delay
    let end = start + duration

    let lastState = this.buffer.length
      ? this.buffer[this.buffer.length - 1].state
      : this.state
    let ds = Object.entries(lastState).reduce((a, [key, from]) => {
      let to = newState[key]
      a[key] = to - from
      return a
    }, {})

    this.endTime = Math.max(this.endTime, end)

    this.buffer.push({
      start
      , end
      , state: newState
      , ds
    })

    return this
  }

  set(newState) {
    Object.assign(this.state, newState)
    return this
  }

  clear() {
    this.time = 0
    this.endTime = 0
    this.startState = null
    this.buffer = []
    return this
  }

  pause() {
    this.paused = true
    return this
  }

  start() {
    this.paused = false
    return this
  }
}
