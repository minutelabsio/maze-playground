<template lang="pug">
.maze
  canvas(ref="canvas", :width="width", :height="height")
</template>

<script>
import rough from 'roughjs/bundled/rough.esm'
import _shuffle from 'lodash/shuffle'
import _findIndex from 'lodash/findIndex'
import _find from 'lodash/find'
import _pull from 'lodash/pull'

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

function makeGrid(size){
  const cols = size
  const rows = 2 * cols - 1
  let i = 0
  let nodes = []
  let lastRow = []
  let thisRow = []
  for (let row = 1; row <= rows; row++){
    for (let col = 1; col <= cols; col++){
      let isOdd = row % 2 === 0
      let x = (col + (isOdd ? 0.5 : 0))
      let y = row
      if (!isOdd || col < cols){
        let node = makeNode(x, y, i)
        i++
        nodes.push(node)
        // links
        let l = thisRow.length
        if (row > 1){
          if (isOdd){
            connect(node, lastRow[l])
            connect(node, lastRow[l + 1])
          } else if (col > 1 && col < cols){
            connect(node, lastRow[l - 1])
            connect(node, lastRow[l])
          } else if (col === 1) {
            connect(node, lastRow[0])
          } else if (col === cols){
            connect(node, lastRow[cols - 2])
          }
        }
        thisRow.push(node)
      }
    }
    lastRow = thisRow
    thisRow = []
  }
  return nodes
}

function recursiveBacktrack(grid){
  const out = grid.map(n => makeNode(n.x, n.y, n.id))
  let visited = []
  const carve = idx => {
    let n = grid[idx]
    visited.push(n)
    let links = _shuffle(n.links)
    for (let next of links){
      if (visited.indexOf(next) < 0){
        let nextidx = _findIndex(out, ['id', next.id])
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
      , default: 900
    }
    , height: {
      type: Number
      , default: 900
    }
  }
  , mounted(){
    this.rc = rough.canvas(this.$refs.canvas)
    this.drawGrid()
  }
  , methods: {
    drawGrid(){
      const rc = this.rc
      const dotStyle = { strokeWidth: 0.5, fill: 'tomato' }
      const dot = (x, y) => rc.circle(x, y, 5, dotStyle)

      const cols = 13
      const rows = 2 * cols - 1
      const xs = this.width / (cols + 1)
      const ys = this.height / (rows + 2)

      const grid = makeGrid(cols)
      // fractalize grid
      const dim =  niceDivisor(cols - 1)
      const innerW = dim
      const innerH = innerW * 2
      const gapCol = (cols + 1 - innerW) / 2
      const gapRow = (rows + 1 - innerH) / 2
      let rem = []
      for (let n of grid){
        if (
          n.x >= gapCol &&
          n.x <= gapCol + innerW &&
          n.y >= gapRow &&
          n.y <= gapRow + innerH
        ){
          rem.push(n)
        }
      }

      rem.forEach((n, i) => {
        let mod = (2 * innerW + 1)
        let y = Math.floor(i / mod) + 1
        let x = i % mod + 1
        if (x > innerW + 1){
          y += 0.5
          x -= innerW + 1.5
        }
        rc.circle(n.x * xs, n.y * ys, 7, { stroke: 'red' })
        _pull(grid, n)
        if (
          y === 1 ||
          y === innerW + 1 ||
          x === 1 ||
          x === innerW + 1
        ){
          let outer = _find(grid, { x: (x - 1) * (dim - 1) + 1, y: 2 * (y - 1) * (dim - 1) + 1 })
          n.links.concat([]).forEach(l => {
            disconnect(n, l)
            connect(outer, l)
          })
        } else {
          n.links.concat([]).forEach(l => disconnect(n, l))
        }
      })

      const maze = recursiveBacktrack(grid)

      for (let node of maze){
        let x = node.x * xs
        let y = node.y * ys
        dot(x, y)
        for (let link of node.links){
          let x2 = link.x * xs
          let y2 = link.y * ys
          rc.line(x, y, x2, y2, { stroke: 'gold' })
        }
      }

      // outer
      rc.rectangle(xs, ys, xs * (cols - 1), ys * (rows - 1))

      // rc.rectangle(
      //   gapCol * xs,
      //   gapRow * ys,
      //   innerW * xs,
      //   innerH * ys)
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
  background: white
</style>
