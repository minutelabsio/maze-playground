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
import { smoother } from '@/lib/smoother'
import { torusGrid, recursiveBacktrack } from '@/maze/maze'

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
    mazeW: 72
    , mazeD: 3
    , center: [0, 0]
    , angle: Math.PI / 2
    , skew: 1
    , zoomExp: -0.1
    , minR: 3
  })
  , mounted(){
    this.ctx = this.$refs.canvas.getContext('2d')

    const $x = scaleLinear()
    const $y = scaleLinear()
    const $xTrue = scaleLinear()
    const $yTrue = scaleLinear()

    const mod = Math.log2(Math.pow(1 - Math.PI * 2 / this.mazeW, this.mazeD))

    this.smooth = smoother({
      zoomExp: () => this.zoomExp
      , angle: () => this.angle
    }, smooth => {
      // let base = (this.mazeD + 1) // (Math.PI * 2)
      smooth.zoomTrue = Math.pow(2, smooth.zoomExp)
      smooth.zoom = Math.pow(2, (smooth.zoomExp % mod + mod) % mod - 2 * mod)

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
    iterations(){
      let r = 2 * this.minR / this.width
      return Math.ceil(Math.log(r) / Math.log(1 - Math.PI * 2 / this.mazeW) / this.mazeD)
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
      recursiveBacktrack(this.maze)
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
        this.ctx.lineWidth = 1
        this.ctx.strokeStyle = 'rgba(200, 200, 0, 1)'
        this.ctx.beginPath()
        this.mazeWalls.forEach(l => {
          let m = isBridge(l) ? 1 : 0
          for (let n = 0; n < nLayers; n++){
            let first = $coords(l.first, n + m)
            let second = $coords(l.second, n)
            // let z = (Math.min(first.r, second.r) * o - 0.01)
            // drawWall(first, second, Math.sqrt(Math.max(z, 0)))
            this.ctx.moveTo(first.x, first.y)
            this.ctx.lineTo(second.x, second.y)
          }
        })
        this.ctx.stroke()
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

      draw(this.iterations)
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
