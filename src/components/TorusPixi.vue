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
  .maze(ref="maze", tabindex="0", v-drag="onDrag", @wheel.passive="onWheel")
    canvas(ref="canvas", :width="width", :height="height")
</template>

<script>
import { Application, Graphics, Container } from 'pixi.js'
import { smoother } from '@/lib/smoother'
import { torusGrid, recursiveBacktrack } from '@/maze/maze'

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
    , mazeD: 10
    , center: [0, 0]
    , angle: Math.PI / 2
    , skew: 1
    , zoomExp: -0.1
    , minR: 3
  })
  , mounted(){
    // this.ctx = this.$refs.canvas.getContext('2d')

    this.app = new Application({
      width: this.width
      , height: this.height
      , antialias: true
      , transparent: true
      , resolution: 2
      , autoDensity: true
      , view: this.$refs.canvas
    })

    const mazeContainer = this.mazeContainer = new Container()
    this.app.stage.addChild(mazeContainer)
    this.$refs.maze.appendChild(this.app.view)

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
      let dx = skew * smooth.zoom * hw

      let hh = this.height / 2
      let dy = smooth.zoom * hh

      const stage = this.app.stage
      stage.position.set(this.center[0] + this.width / 2, this.center[1] + this.height / 2)
      stage.scale.set(dx, dy)
      mazeContainer.rotation = smooth.angle
      // mazeContainer.children.forEach(ch => {
      //   ch._redraw(smooth.zoom)
      // })
    })

    this.makeMaze()

    // const draw = () => {
    //   window.requestAnimationFrame(draw)
    //   this.draw()
    // }

    // this.$on('hooks:beforeDestroy', () => {
    //   window.cancelAnimationFrame(draw)
    //   this.smooth.$destroy()
    // })

    // draw()
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
      this.setupViews()
    }
    , setupViews(){
      if (!this.maze){ return }
      const da = Math.PI * 2 / this.maze.width

      const $coords = (n, z = 0) => {
        let p = this.maze.toNormalized(n.x, n.y)
        // let {x, y} = p
        let alpha = p.x * Math.PI * 2 + this.smooth.angle
        // creates even radial grid
        let r = Math.pow(1 - da, n.y + this.maze.depth * z)
        let x = r * Math.cos(alpha)
        let y = r * Math.sin(alpha)
        return {
          x
          , y
          , r
        }
      }

      const isBridge = (link) => {
        return Math.abs(link.first.y - link.second.y) > 1
      }

      // clear
      this.mazeContainer.removeChildren()

      const makeWall = (first, second) => {
        let line = new Graphics()
        line._redraw = (scale) => {
          line.clear()
          line.lineStyle(1/this.width/scale, 0xcccc00, 1)
          line.moveTo(0, 0)
          line.lineTo(second.x - first.x, second.y - first.y)
        }
        line._redraw(this.smooth.zoom)
        line.x = first.x
        line.y = first.y
        this.mazeContainer.addChild(line)
      }

      const draw = (nLayers) => {
        this.mazeWalls.forEach(l => {
          let m = isBridge(l) ? 1 : 0
          for (let n = 0; n < nLayers; n++){
            let first = $coords(l.first, n + m)
            let second = $coords(l.second, n)
            // let z = (Math.min(first.r, second.r) * o - 0.01)
            // drawWall(first, second, Math.sqrt(Math.max(z, 0)))
            makeWall(first, second)
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
        // let start = this.maze.nodes[0]
        // let end = this.maze.nodes[this.maze.nodes.length - 1]
        // dot($coords(start, start.z, true), 'rgba(0, 200, 0, 1)')
        // dot($coords(end, end.z, true), 'rgba(200, 0, 0, 1)')
      }

      draw(this.iterations)
      // draw(1)
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
