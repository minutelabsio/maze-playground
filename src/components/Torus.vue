<template lang="pug">
.wrap
  .container
    .section
      .columns
        .column
          b-field(grouped)
            b-field
              b-button.btn-dark(@click="resetPosition") Reset Position
            b-field
              b-button.btn-dark(@click="makeMaze") Remake
            //- b-field
            //-   b-button.btn-dark(@click="changePerspective") Change perspective
            b-field
              b-button.btn-dark(type="is-primary", @click="solve") Show Solution
          b-field(grouped)
            b-field(label="Follow Zoom")
              b-switch(v-model="followZoom")
        .column
          b-field(label="Spokes")
            b-slider(:min="10", :max="100", :step="1" v-model="mazeW")
          b-field(label="Recursion Levels")
            b-slider(:min="3", :max="50", :step="1" v-model="mazeD")
          //- b-field(label="Difficulty")
          //-   b-select(v-model="difficulty")
          //-     option(value="easy") Easy
          //-     option(value="medium") Medium
          //-     option(value="hard") Hard
  .maze(
    ref="maze",
    tabindex="0",
    v-drag="onDrag",
    @wheel.passive="onWheel"
  )
    canvas(ref="canvas", :width="width", :height="height")
</template>

<script>
import _sample from 'lodash/sample'
import _isEqual from 'lodash/isEqual'
import _findIndex from 'lodash/findIndex'
import { scaleLinear, scaleLog } from 'd3-scale'
import { smoother } from '@/lib/smoother'
import { torusGrid, addConfoundingLoops, depthFirst, findSolution } from '@/maze/maze'


const centerOpacityForDensity = scaleLog().domain([100, 10])

function shortestAngle(a, old){
  let d = a - old
  if (d > Math.PI){
    return d - Math.PI * 2 + old
  } else if (d < -Math.PI){
    return d + Math.PI * 2 + old
  } else {
    return a
  }
}

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
      , default: 1600
    }
    , height: {
      type: Number
      , default: 900
    }
  }
  , data: () => ({
    mazeW: 20
    , mazeD: 3
    , center: [0, 0]
    , angle: Math.PI / 2
    , skew: 1
    , zoomExp: 0
    , minR: 3
    , nodeIndex: [-1, 0]
    , nodePos: [0, 0, 0]
    , maze: null
    , path: []
    , sol: false
    , solved: false
    , difficulty: 'easy'
    , followZoom: true
  })
  , mounted(){
    this.ctx = this.$refs.canvas.getContext('2d')

    const $x = scaleLinear()
    const $y = scaleLinear()
    const $xTrue = scaleLinear()
    const $yTrue = scaleLinear()

    this.smooth = smoother({
      zoomExp: { get: () => this.zoomExp, tightness : 0.05 }
      , angle: { get: () => this.angle, tightness: 0.05 }
    }, smooth => {
      const mod = this.mod
      // let base = (this.mazeD + 1) // (Math.PI * 2)
      smooth.zoomTrue = Math.pow(2, smooth.zoomExp)
      smooth.zoom = Math.pow(2, (smooth.zoomExp % mod + mod) % mod - 2 * mod)

      let skew = this.skew //1 + Math.cos(smooth.phi)

      let half = Math.min(this.width, this.height) / 2
      let hw = this.width / 2
      let ox = this.center[0] + hw
      let dx = skew * smooth.zoom * half
      smooth.$x = $x.range([ox - dx, ox + dx])
      let dxTrue = skew * smooth.zoomTrue * half
      smooth.$xTrue = $xTrue.range([ox - dxTrue, ox + dxTrue])

      let hh = this.height / 2
      let oy = this.center[1] + hh
      let dy = smooth.zoom * half
      smooth.$y = $y.range([oy - dy, oy + dy])
      let dyTrue = smooth.zoomTrue * half
      smooth.$yTrue = $yTrue.range([oy - dyTrue, oy + dyTrue])

      this.draw()
    })

    this.makeMaze()

    const onKey = e => {
      switch (e.code){
        case 'KeyW':
        case 'ArrowUp':
          while(this.move(2)){ 0 }
          break
        case 'KeyS':
        case 'ArrowDown':
          while(this.move(3)){ 0 }
          break
        case 'KeyA':
        case 'ArrowLeft':
          while(this.move(0)){ 0 }
          break
        case 'KeyD':
        case 'ArrowRight':
          while(this.move(1)){ 0 }
          break
      }
    }

    window.addEventListener('keydown', onKey)

    this.$on('hook:beforeDestroy', () => {
      this.smooth.$destroy()
      window.removeEventListener('keydown', onKey)
    })
  }
  , watch: {
    mazeW: 'makeMaze'
    , mazeD: 'makeMaze'
  }
  , computed: {
    iterations(){
      let r = 2 * this.minR / this.width
      let its = Math.ceil(1.5 * Math.log(r) / Math.log(1 - Math.PI * 2 / this.mazeW) / this.mazeD)
      return Math.max(its, 6)
    }
    , node(){
      if (!this.maze){ return }
      return this.maze.nodes[this.nodeIndex[0]]
    }
    , mod(){
      return Math.log2(Math.pow(1 - Math.PI * 2 / this.mazeW, this.mazeD))
    }
    , centerOpacity(){
      return centerOpacityForDensity(this.mazeW)
    }
  }
  , methods: {
    move(index){
      if (!this.node){ return false }
      let z = this.nodeIndex[1]

      let n = this.node.neighbours[index]
      if (this.node.links.indexOf(n.node) < 0){ return false }

      this.setNode(this.maze.getIndex(n.node.x, n.node.y), z + n.wrapY)
      return this.node.links.length === 2 && this.node !== this.maze.nodes[this.maze.nodes - 1]
    }
    , setNode(index, z){
      this.nodeIndex = [index, z]
      let {x, y} = this.maze.nodes[index]
      this.nodePos = {x, y, z}

      // move perspective
      if (!this.dragging){
        const mod = this.mod
        let p = this.maze.toNormalized(x, y)
        this.angle = shortestAngle(-p.x * Math.PI * 2 + Math.PI / 2, this.angle)
        if (this.followZoom){
          this.zoomExp = (1 / this.mazeD - p.y - z) * mod + (this.skew === 1 ? -1 : 0)
        }
      }

      // update path
      let idx = _findIndex(this.path, n => _isEqual(this.nodePos, n))
      if (idx >= 0){
        this.path.splice(idx, this.path.length)
      }
      this.path.push(this.nodePos)

      let l = this.maze.nodes.length
      if (this.nodeIndex[0] === l - 1 && this.maze.nodes[l - 1].z === this.nodeIndex[1]){
        this.solved = true
      }
    }
    , onWheel(e){
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
        this.center[1] = -this.height / 2
      } else {
        this.skew = 1
        this.center[1] = 0
      }
    }
    , resetPosition(){
      // this.angle = Math.PI / 2
      // this.zoomExp = -0.1
      this.setNode(0, 0)
      this.solved = false
    }
    , isAppropriateSolution(len){
      // let n = this.mazeD * this.mazeW
      // let ranges = [12, 8, 2, 1].map(b => Math.round(n / b))
      // switch (this.difficulty){
      //   case 'easy':
      //     return len > ranges[0] && len < ranges[1]
      //   case 'medium':
      //     return len > ranges[1] && len < ranges[2]
      //   case 'hard':
      //     return len > ranges[2] && len < ranges[3]
      // }
      return len > 30
    }
    , makeMaze(){
      let maze = torusGrid(this.mazeW, this.mazeD)
      let attempts = 10
      while (attempts--) {
        depthFirst(maze)
        let sol = findSolution(maze.nodes)
        if (this.isAppropriateSolution(sol.length)){ break }
      }
      if (attempts < 1){ console.log('maxed out attempts to produce difficult maze')}
      const holes = Math.round(Math.sqrt(maze.nodes.length) / 4)
      // console.log('holes', holes)
      maze.solution = findSolution(maze.nodes)
      addConfoundingLoops(maze, holes)
      this.maze = Object.freeze(maze)
      this.mazeLinks = this.maze.links()
      this.mazeWalls = this.maze.walls()
      this.path = []
      this.resetPosition()
      this.sol = false
    }
    , draw(){
      if (!this.maze){ return }
      const ctx = this.ctx
      ctx.clearRect(0, 0, this.width, this.height)

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
          , ox: x
          , oy: y
          , r
          , alpha
        }
      }

      const dot = ({x, y}, color = 'grey') => {
        drawCircle(ctx, x, y, 5, color)
      }

      const arcBetween = (first, second, real = false) => {
        let $sx = real ? $xTrue : $x
        let $sy = real ? $yTrue : $y
        // overly complicated way of drawing an arc...
        // angle of control point between each point
        let a = (first.alpha + second.alpha) / 2
        // distance of control point from center
        let r = first.r / Math.cos((second.alpha - first.alpha) / 2)
        // convert to cartesian
        let x = (r * Math.cos(a) + 1) / 2
        let y = (r * Math.sin(a) + 1) / 2
        let arcR = ($sy(first.r) - $sy(0)) / 2
        ctx.arcTo($sx(x), $sy(y), second.x, second.y, arcR)
      }

      const isBridge = (link) => {
        return Math.abs(link.first.y - link.second.y) > 1
      }

      const drawPath = (start, path, color) => {
        let first = $coords(start, start.z, true)
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(first.x, first.y)
        path.reduce(([l, last], p) => {
          let n = $coords(p, p.z, true)
          if (l.y === p.y){
            arcBetween(last, n, true)
          } else {
            ctx.lineTo(n.x, n.y)
          }
          return [p, n]
        }, [start, first])
        ctx.stroke()
      }

      const co = this.centerOpacity
      // create maze
      const draw = (nLayers) => {
        const [cx, cy] = [this.width / 2 + this.center[0], this.height / 2 + this.center[1]]
        let radGrad = ctx.createRadialGradient(
          cx, cy, 1,
          cx, cy, this.width / 3
        )
        radGrad.addColorStop(0, `rgba(200, 200, 0, ${co})`)
        radGrad.addColorStop(1, 'rgba(200, 200, 0, 1)')
        ctx.strokeStyle = radGrad

        ctx.lineWidth = 1
        // ctx.strokeStyle = 'rgba(200, 200, 0, 1)'
        ctx.beginPath()
        this.mazeWalls.forEach(l => {
          let m = isBridge(l) ? 1 : 0
          for (let n = -2; n < nLayers; n++){
            let first = $coords(l.first, n + m)
            let second = $coords(l.second, n)
            // let z = (Math.min(first.r, second.r) * o - 0.01)
            // drawWall(first, second, Math.sqrt(Math.max(z, 0)))
            ctx.moveTo(first.x, first.y)
            if (l.first.y === l.second.y){
              arcBetween(first, second)
            } else {
              ctx.lineTo(second.x, second.y)
            }
          }
        })
        ctx.stroke()
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
        let pos = this.nodePos
        drawPath(start, this.path, this.solved ? 'rgba(0, 200, 0, 1)' : 'rgba(200, 0, 0, 1)')
        // sol
        if (this.sol){
          drawPath(start, this.sol, 'rgba(0, 200, 0, 1)')
        }

        // dots
        dot($coords(start, start.z, true), 'rgba(0, 200, 0, 1)')
        dot($coords(end, end.z, true), 'rgba(200, 0, 0, 1)')
        dot($coords(pos, pos.z, true), 'white')
      }

      const drawFlat = () => {
        const $coords = ({ x, y }) => ({ x: $xTrue(x), y: $yTrue(y) })
        this.mazeWalls.forEach(l => {
          if (isBridge(l) || Math.abs(l.first.x - l.second.x) > 1){ return }
          let first = $coords(l.first)
          let second = $coords(l.second)
          // drawWall(first, second, 1)
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
    , solve(){
      this.sol = Object.freeze(this.maze.solution)
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
