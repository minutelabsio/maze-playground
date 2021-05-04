<template lang="pug">
.wrap
  .container
    .section
      b-field(grouped)
        b-field
          b-button.btn-dark(@click="resetPosition") Reset Position
        b-field
          b-button.btn-dark(@click="makeMaze") Remake
        b-field
          b-button.btn-dark(@click="changePerspective") Change perspective
  .maze(tabindex="0")
    canvas(ref="canvas", :width="width", :height="height", v-drag="onDrag", @wheel.passive="onWheel")
</template>

<script>
import { scaleLinear } from 'd3-scale'
import _shuffle from 'lodash/shuffle'
import _uniqWith from 'lodash/uniqWith'
import _difference from 'lodash/difference'
import _pull from 'lodash/pull'

function drawCircle(ctx, x, y, r, color) {
  if (color !== ctx.fillStyle) {
    ctx.fillStyle = color
  }
  ctx.beginPath()
  ctx.arc(x, y, r, 0, 2 * Math.PI)
  ctx.fill()
}

function drawLine(ctx, p1, p2, color = 'grey', lineWidth = 2) {
  if (color !== ctx.strokeStyle) {
    ctx.strokeStyle = color
  }
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(p1.x, p1.y)
  ctx.lineTo(p2.x, p2.y)
  ctx.stroke()
}

const makeNode = (x, y, id) => ({x, y, id, links: []})
const connect = (first, second) => {
  if (first.links.indexOf(second) < 0){
    first.links.push(second)
  }
  if (second.links.indexOf(first) < 0){
    second.links.push(first)
  }
}
const disconnect = (first, second) => {
  _pull(first.links, second)
  _pull(second.links, first)
}
const connectionId = (first, second) => {
  return [first.id, second.id].sort().join(' ')
}

function torusGrid(width, depth){
  const grid = {
    nodes: []
    , width
    , depth
    , getIndex(x, y, mod = true){
      if (mod){
        x = ((x % width) + width) % width
        y = ((y % depth) + depth) % depth
      }
      if (x >= width || x < 0){ return -1 }
      if (y >= depth || y < 0){ return -1 }
      return y * width + x
    }
    , get(x, y, mod = true){
      let i = grid.getIndex(x, y, mod)
      return i >= 0 ? grid.nodes[i] : null
    }
    , getAntiLinks(node){
      return _difference(node.neighbours.map(n => n.node), node.links)
    }
    , toNormalized(x, y){
      return { x: x / width, y: y / depth }
    }
    , links(){
      return _uniqWith(
        grid.nodes.reduce((links, n) => {
          let l = n.links.map(second => ({ first: n, second, id: connectionId(n, second) }))
          links.push.apply(links, l)
          return links
        }, [])
        , (a, b) => a.id === b.id
      )
    }
    , walls(){
      let walls = grid.nodes.reduce((walls, n) => {
        let w = grid.getAntiLinks(n).map(second => ({ first: n, second, id: connectionId(n, second) }))
        walls.push.apply(walls, w)
        return walls
      }, [])

      return _uniqWith(walls, (a, b) => a.id === b.id).map(w => {
        let { first, second } = w
        if (first.x === second.x){
          let y = (second.y - first.y) > 1 ? second.y + 0.5 : first.y + 0.5
          return {
            first: { x: first.x - 0.5, y }
            , second: { x: first.x + 0.5, y }
          }
        } else if (first.y === second.y){
          let x = (second.x - first.x) > 1 ? second.x + 0.5 : first.x + 0.5
          return {
            first: { x, y: first.y - 0.5 }
            , second: { x, y: first.y + 0.5 }
          }
        } else {
          console.log(first, second)
          throw new Error("Unreachable")
        }
      })
    }
  }

  for (let y = 0; y < depth; y++){
    for (let x = 0; x < width; x++){
      let id = grid.nodes.length
      let node = makeNode(x, y, id)
      grid.nodes.push(node)
    }
  }

  grid.nodes.forEach(node => {
    let { x, y } = node
    node.neighbours = [
      grid.get(x + 1, y)
      , grid.get(x - 1, y)
      , grid.get(x, y + 1)
      , grid.get(x, y - 1)
    ].map(n => {
      let wrapX = Math.abs(node.x - n.x) > 1 ? (n.x > node.x ? -1 : 1) : 0
      let wrapY = Math.abs(node.y - n.y) > 1 ? (n.y > node.y ? -1 : 1) : 0
      return {
        node: n
        , wrapX
        , wrapY
      }
    })
  })

  return grid
}

function recursiveBacktrack(grid){
  let visited = []
  let z = 0
  const carve = node => {
    node.z = z
    visited.push(node)
    let neighbours = _shuffle(node.neighbours)
    for (let n of neighbours){
      let next = n.node
      if (visited.indexOf(next) < 0){
        z += n.wrapY
        connect(node, next)
        // keep track of the layer
        carve(next)
      }
    }
  }
  carve(grid.nodes[0])
  return grid.nodes
}

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

function smoothProperties(props, onUpdate){
  const keys = Object.keys(props)
  const ret = {}
  const tick = () => {
    window.requestAnimationFrame(tick)
    for (let key of keys){
      let entry = props[key]
      let get = entry.get || entry
      let tightness = entry.tightness || 0.1
      ret[key] = lerp(+ret[key] || 0, get(), tightness)
    }
    if (onUpdate){ onUpdate(ret) }
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

export default {
  name: 'Torus'
  , props: {
    width: {
      type: Number
      , default: 900
    }
    , height: {
      type: Number
      , default: 900
    }
  }
  , data: () => ({
    mazeW: 60
    , mazeD: 10
    , center: [0, 0]
    , angle: Math.PI / 2
    , skew: 1
    , zoomExp: -0.1
  })
  , mounted(){
    this.ctx = this.$refs.canvas.getContext('2d')

    const $x = scaleLinear()
    const $y = scaleLinear()
    const $xTrue = scaleLinear()
    const $yTrue = scaleLinear()

    // This is not 2 because... idk.
    // it was jumping around when wrapping and i think
    // it has something to do with the line width
    const mod = this.mazeD / (Math.PI * 1.995)

    this.smooth = smoothProperties({
      zoomExp: () => this.zoomExp
      , angle: () => this.angle
    }, smooth => {
      // let base = (this.mazeD + 1) // (Math.PI * 2)
      smooth.zoomTrue = Math.pow(2, smooth.zoomExp)
      smooth.zoom = Math.pow(2, (smooth.zoomExp % mod + mod) % mod + mod)

      let skew = this.skew //1 + Math.cos(smooth.phi)

      let hw = this.width / 2
      let ox = this.center[0] + hw
      let dx = skew * smooth.zoom * hw
      smooth.$x = $x.range([ox - dx, ox + dx])
      let dxTrue = skew * smooth.zoomTrue * hw
      smooth.$xTrue = $xTrue.range([ox - dxTrue, ox + dxTrue])

      let hh = this.height / 2
      let oy = this.center[1] + hh
      let dy = smooth.zoom * hh
      smooth.$y = $y.range([oy - dy, oy + dy])
      let dyTrue = smooth.zoomTrue * hh
      smooth.$yTrue = $yTrue.range([oy - dyTrue, oy + dyTrue])
    })

    this.makeMaze()

    const draw = () => {
      window.requestAnimationFrame(draw)
      this.draw()
    }

    this.$on('hooks:beforeDestroy', () => {
      window.cancelAnimationFrame(draw)
      this.smooth.$destroy()
    })

    draw()
  }
  , computed: {
    // xScale(){
    //   let hw = this.width / 2
    //   let ox = this.center[0] + hw
    //   let dx = this.zoomAnim * hw

    //   return scaleLinear()
    //     .range([ox - dx, ox + dx])
    // }
    // , yScale(){
    //   let hh = this.height / 2
    //   let oy = this.center[1] + hh
    //   let dy = this.zoomAnim * hh

    //   return scaleLinear()
    //     .range([oy - dy, oy + dy])
    // }
    // , zoom(){
    //   return Math.pow((this.mazeD + 1) / (Math.PI * 2), (this.zoomExp + 4) % 2 + 2)
    // }
    // , trueZoom(){
    //   return Math.pow((this.mazeD + 1) / (Math.PI * 2), this.zoomExp + 2)
    // }
  }
  , methods: {
    onWheel(e){
      this.zoomExp -= e.deltaY / 1000
    }
    , onDrag({ first, last, deltaX, deltaY }){
      if (last){ this.dragging = false }
      if (first){ this.dragging = true }
      if (!this.dragging){ return }
      if (deltaX || deltaY){
        // this.center = [this.center[0] + deltaX, this.center[1] + deltaY]
        this.angle -= 2 * deltaX / this.width
        this.phi -= 2 * deltaY / this.height
      }
    }
    , changePerspective(){
      if (this.center[1] === 0){
        this.skew = 2
        this.center[1] = -this.height/2
      } else {
        this.skew = 1
        this.center[1] = 0
      }
    }
    , resetPosition(){
      this.angle = Math.PI / 2
      this.zoomExp = -0.1
    }
    , makeMaze(){
      this.maze = torusGrid(this.mazeW, this.mazeD)
      this.maze.nodes = recursiveBacktrack(this.maze)
      this.mazeLinks = this.maze.links()
      this.mazeWalls = this.maze.walls()
    }
    , draw(){
      if (!this.maze){ return }
      const ctx = this.ctx
      ctx.clearRect(0, 0, this.width, this.height)
      const dot = ({x, y}, color = 'grey') => {
        drawCircle(ctx, x, y, 5, color)
      }
      const drawPath = (one, two, o = 1) => {
        drawLine(ctx, one, two, `rgba(200, 0, 0, ${o})`, 1)
      }
      const drawWall = (one, two, o = 1) => {
        drawLine(ctx, one, two, `rgba(200, 200, 0, ${o})`, 1)
      }
      const $x = this.smooth.$x
      const $y = this.smooth.$y
      const $xTrue = this.smooth.$xTrue
      const $yTrue = this.smooth.$yTrue
      const da = Math.PI * 2 / this.maze.width

      const $coords = (n, z = 0, real = false) => {
        let p = this.maze.toNormalized(n.x, n.y)
        // let {x, y} = p
        let alpha = p.x * Math.PI * 2 + this.smooth.angle
        // creates even radial grid
        let r = Math.pow(1 - da, n.y + this.maze.depth * z)
        let x = (r * Math.cos(alpha) + 1) / 2
        let y = (r * Math.sin(alpha) + 1) / 2
        return {
          x: real ? $xTrue(x) : $x(x)
          , y: real ? $yTrue(y) : $y(y)
          , r
        }
      }

      const isBridge = (link) => {
        return Math.abs(link.first.y - link.second.y) > 1
      }

      const o = this.smooth.zoom
      // create maze
      const draw = (nLayers) => {
        this.mazeWalls.forEach(l => {
          let m = isBridge(l) ? 1 : 0
          for (let n = 0; n < nLayers; n++){
            let first = $coords(l.first, n + m)
            let second = $coords(l.second, n)
            let z = (Math.min(first.r, second.r) * o - 0.01)
            drawWall(first, second, Math.sqrt(Math.max(z, 0)))
          }
        })
        // this.mazeLinks.forEach(l => {
        //   let m = isBridge(l) ? 1 : 0
        //   for (let n = 0; n < nLayers; n++){
        //     let first = $coords(l.first, n + m)
        //     let second = $coords(l.second, n)
        //     let z = (Math.min(first.r, second.r) * o - 0.01)
        //     drawPath(first, second, Math.sqrt(Math.max(z, 0)))
        //   }
        // })
        let start = this.maze.nodes[0]
        let end = this.maze.nodes[this.maze.nodes.length - 1]
        dot($coords(start, start.z, true), 'rgba(0, 200, 0, 1)')
        dot($coords(end, end.z, true), 'rgba(200, 0, 0, 1)')
      }

      const drawFlat = () => {
        const $coords = ({ x, y }) => ({ x: $xTrue(x), y: $yTrue(y) })
        this.mazeWalls.forEach(l => {
          if (isBridge(l) || Math.abs(l.first.x - l.second.x) > 1){ return }
          let first = $coords(l.first)
          let second = $coords(l.second)
          drawWall(first, second, 1)
        })
        this.mazeLinks.forEach(l => {
          if (isBridge(l) || Math.abs(l.first.x - l.second.x) > 1){ return }
          let first = $coords(l.first)
          let second = $coords(l.second)
          drawPath(first, second, 1)
        })
      }

      draw(6)
      // drawFlat()
    }
  }
}
</script>

<style lang="sass" scoped>
.maze
  display: flex
  justify-content: center
canvas
  margin: 1rem
  outline: 1px solid #333
  // background: white
</style>
