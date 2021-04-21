<template lang="pug">
.maze(tabindex="0", v-drag="onDrag", @wheel.passive="onWheel")
  canvas(ref="canvas", :width="width", :height="height")
</template>

<script>
import { scaleLinear } from 'd3-scale'
import _shuffle from 'lodash/shuffle'
import _unionWith from 'lodash/unionWith'
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
    , toNormalized(x, y){
      return { x: x / width, y: y / depth }
    }
    , links(){
      return grid.nodes.reduce((links, n) => {
        return _unionWith(
          links,
          n.links.map(second => ({ first: n, second, id: connectionId(n, second) })),
          (a, b) => a.id === b.id
        )
      }, [])
    }
  }

  for (let y = 0; y < depth; y++){
    for (let x = 0; x < width; x++){
      let id = grid.nodes.length
      let node = makeNode(x, y, id)
      ;[
        grid.get(x + 1, y)
        , grid.get(x - 1, y)
        , grid.get(x, y + 1)
        , grid.get(x, y - 1)
      ].forEach(n => n && connect(node, n))
      grid.nodes.push(node)
    }
  }

  return grid
}

function recursiveBacktrack(grid){
  const out = grid.nodes.map(n => makeNode(n.x, n.y, n.id))
  let visited = []
  const carve = idx => {
    let n = grid.nodes[idx]
    visited.push(n)
    let links = _shuffle(n.links)
    for (let next of links){
      if (visited.indexOf(next) < 0){
        let nextidx = grid.getIndex(next.x, next.y)
        connect(out[idx], out[nextidx])
        carve(nextidx)
      }
    }
  }
  carve(0)
  return out
}


export default {
  name: 'Torus'
  , props: {
    width: {
      type: Number
      , default: 1200
    }
    , height: {
      type: Number
      , default: 1200
    }
  }
  , data: () => ({
    center: [0, 0]
    , zoomExp: 1
  })
  , mounted(){
    this.ctx = this.$refs.canvas.getContext('2d')
    this.makeMaze()
    const draw = () => {
      window.requestAnimationFrame(draw)
      this.draw()
    }

    this.$on('hooks:beforeDestroy', () => {
      window.cancelAnimationFrame(draw)
    })

    draw()
  }
  , computed: {
    xScale(){
      let hw = this.width / 2
      let ox = this.center[0] + hw
      let dx = this.zoom * hw

      return scaleLinear()
        .range([ox - dx, ox + dx])
    }
    , yScale(){
      let hh = this.height / 2
      let oy = this.center[1] + hh
      let dy = this.zoom * hh

      return scaleLinear()
        .range([oy - dy, oy + dy])
    }
    , zoom(){
      return Math.pow(2, (this.zoomExp - 4) % 2 + 2)
    }
    , trueZoom(){
      return Math.pow(2, this.zoomExp)
    }
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
        this.center = [this.center[0] + deltaX, this.center[1] + deltaY]
      }
    }
    , makeMaze(){
      this.maze = torusGrid(60, 10)
      this.maze.nodes = recursiveBacktrack(this.maze)
      this.mazeLinks = this.maze.links()
    }
    , draw(){
      if (!this.maze){ return }
      const ctx = this.ctx
      ctx.clearRect(0, 0, this.width, this.height)
      const dot = (x, y) => {
        drawCircle(ctx, x, y, 5, 'grey')
      }
      const line = (one, two, z = 1) => {
        let o = 1 - z * 0.2
        drawLine(ctx, one, two, `rgba(0, 200, 200, ${o})`, 1)
      }
      const $x = this.xScale
      const $y = this.yScale

      const $coords = (n) => {
        let p = this.maze.toNormalized(n.x, n.y)
        // let {x, y} = p
        let alpha = p.x * Math.PI * 2
        let r = (p.y + 1) / 2
        let x = (r * Math.cos(alpha) + 1) / 2
        let y = (r * Math.sin(alpha) + 1) / 2
        return {
          x: $x(x)
          , y: $y(y)
        }
      }

      const isOuter = (node) => {
        return Math.abs(node.x) === Math.abs(node.y)
      }

      // create maze
      const draw = (nLayers) => {
        // for (let node of this.maze.nodes){
        //   let x = $x(node.x)
        //   let y = $y(node.y)
        //   if (node.links.length){
        //     dot(x, y)
        //   }
        // }

        this.mazeLinks.forEach(l => {

          let first = $coords(l.first)
          let second = $coords(l.second)
          line(first, second)
          // if (isXC){
          //   second = scaleBy(second, 1)
          // }

          // for (let n = -1; n < nLayers; n++){
          //   line($coords(scaleBy(first, n)), $coords(scaleBy(second, n)), zo + n)
          // }
        })
      }

      draw(6)
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
