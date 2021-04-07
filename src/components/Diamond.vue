<template lang="pug">
.maze(tabindex="0", v-drag="onDrag", @wheel.passive="onWheel")
  canvas(ref="canvas", :width="width", :height="height")
</template>

<script>
import rough from 'roughjs/bundled/rough.esm'
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

function diamondGrid(n){
  const h = (n - 1) / 2
  const grid = {
    nodes: []
    , size: n
    , h
    , getIndex(x, y){
      if (x < 0 || x >= n){ return -1 }
      let yb = h - Math.abs(h - x)
      if (y > yb || y < -yb){ return -1 }
      let index = -1
      if (x <= h){
        index = (x + 1) * x + y
      } else {
        index = -2 * h * h + (1 + 4 * h - x) * x + y
      }
      return index
    }
    , get(x, y){
      let i = grid.getIndex(x, y)
      return i >= 0 ? grid.nodes[i] : null
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
  for (let x = 0; x < n; x++){
    let yb = h - Math.abs(h - x)
    for (let y = -yb; y <= yb; y++){
      let node = makeNode(x, y, `${x}/${y}`)
      grid.nodes.push(node)
      let neighbours = [
        grid.get(x - 1, y)
        , grid.get(x, y + 1)
        , grid.get(x + 1, y)
        , grid.get(x, y - 1)
      ]
      neighbours.forEach(n => {
        if (n){ connect(node, n) }
      })
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

function niceDivisor(n){
  return [4, 5, 3, 2].find(d => n % d === 0)
}

export default {
  name: 'Maze'
  , props: {
    width: {
      type: Number
      , default: 1600
    }
    , height: {
      type: Number
      , default: 1600
    }
  }
  , data: () => ({
    gridSize: 5*5
    , center: [0, 0]
    , zoomExp: 2
  })
  , mounted(){
    this.rc = rough.canvas(this.$refs.canvas)
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
        .domain([0, this.gridSize - 1])
        .range([ox - dx, ox + dx])
    }
    , yScale(){
      let hh = this.height / 2
      let oy = this.center[1] + hh
      let dy = this.zoom * hh

      let h = (this.gridSize - 1) / 2
      return scaleLinear()
        .domain([h, -h])
        .range([oy - dy, oy + dy])
    }
    , dim(){
      const edge = (this.gridSize + 1) / 2
      return niceDivisor(edge - 1)
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
      const grid = diamondGrid(this.gridSize)
      // fractalize
      const dim = this.dim
      if (!dim){ return }
      const h = grid.h
      const scale = h / dim
      // rc.line($x(h - dim), $y(0), $x(h), $y(dim), { stroke: 'tomato'})
      // rc.line($x(h), $y(dim), $x(h + dim), $y(0), { stroke: 'tomato'})
      // rc.line($x(h + dim), $y(0), $x(h), $y(-dim), { stroke: 'tomato'})
      // rc.line($x(h), $y(-dim), $x(h - dim), $y(0), { stroke: 'tomato'})

      const isInside = (x, y) => {
        const yb = dim - Math.abs(h - x)
        return x > h - dim &&
          x < h + dim &&
          y < yb &&
          y > -yb
      }

      const isInsideBorder = (x, y) => {
        const yb = dim - Math.abs(h - x)
        return (
          x === h - dim + 1 ||
          x === h + dim - 1 ||
          y === yb - 1 ||
          y === -yb + 1
        ) && isInside(x, y)
      }

      for (let dx = -dim; dx <= dim; dx++){
        const yb = dim - Math.abs(dx)
        for (let dy = -yb + 1; dy < yb && yb > 0; dy++){
          let node = grid.get(h + dx, dy)
          node.links.concat([]).forEach(l => {
            if (isInside(l.x, l.y)){
              disconnect(node, l)
            }
          })
        }
      }

      const innerNodes = grid.nodes.filter(({x, y}) => isInsideBorder(x, y))
      grid.xConnections = []

      innerNodes.forEach(node => {
        let out = grid.get((node.x - h) * (scale + 1) + h, node.y * (scale + 1))
        node.links.concat([]).forEach(l => {
          disconnect(l, node)
          // Not the first and last nodes
          // those are start and finish
          if (out.x === 0 || out.x === this.gridSize - 1){ return }
          connect(l, out)
          grid.xConnections.push(connectionId(l, out))
        })
      })

      grid.nodes = recursiveBacktrack(grid)
      this.maze = grid
      this.mazeLinks = grid.links()
    }
    , draw(){
      if (!this.maze){ return }
      const dim = this.dim
      if (!dim){ return }
      const h = this.maze.h
      const ctx = this.ctx
      ctx.clearRect(0, 0, this.width, this.height)
      const dotStyle = { strokeWidth: 0.5, fill: 'tomato' }
      const dot = (x, y) => {
        // rc.circle(x, y, 5, dotStyle)
        drawCircle(ctx, x, y, 5, 'grey')
      }
      const line = (one, two, z = 1) => {
        let o = 1 - (z + 1) * 0.2
        drawLine(ctx, one, two, `rgba(0, 200, 200, ${o})`, 1)
      }
      const $x = this.xScale
      const $y = this.yScale

      const isOuter = (node) => {
        return Math.abs(node.x) === Math.abs(node.y)
      }

      const scale = 1 / (h / dim + 1)
      const scaleBy = (p, z) => {
        const s = Math.pow(scale, z)
        return {
          x: (p.x - h) * s + h
          , y: p.y * s
        }
      }
      const $coords = (p) => {
        return {
          x: $x(p.x)
          , y: $y(p.y)
        }
      }

      // create maze
      const draw = (nLayers) => {
        // for (let node of grid.nodes){
        //   let x = $x(node.x)
        //   let y = $y(node.y)
        //   if (node.links.length){
        //     dot(x, y)
        //   }
        // }
        let zo = -Math.log2(this.zoom) / 2

        this.mazeLinks.forEach(l => {
          let isXC = this.maze.xConnections.indexOf(l.id) > -1

          let first = l.first
          let second = l.second

          if (isOuter(first)){
            second = l.first
            first = l.second
          }

          if (isXC){
            second = scaleBy(second, 1)
          }

          for (let n = -1; n < nLayers; n++){
            line($coords(scaleBy(first, n)), $coords(scaleBy(second, n)), zo + n)
          }
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
  outline: 1px solid red
  // background: white
</style>
