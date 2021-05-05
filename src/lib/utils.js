export function lerp(min, max, v, clamp = false) {
  if (clamp) {
    if (v >= 1) {
      return max
    }
    if (v <= 0) {
      return min
    }
  }
  return max * v + min * (1 - v)
}

export function copyToClipboard( str ) {
  const el = document.createElement('textarea')
  el.value = str
  el.setAttribute('readonly', '')
  el.style.position = 'absolute'
  el.style.left = '-9999px'
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}
