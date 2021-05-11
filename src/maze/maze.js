import _shuffle from 'lodash/shuffle'
import _flatten from 'lodash/flatten'
import _sample from 'lodash/sample'
import _sampleSize from 'lodash/sampleSize'
import _uniqWith from 'lodash/uniqWith'
import _difference from 'lodash/difference'
import _pull from 'lodash/pull'

export const makeNode = (x, y, id) => ({ x, y, id, links: [] })
export const connect = (first, second) => {
  if (first.links.indexOf(second) < 0) {
    first.links.push(second)
  }
  if (second.links.indexOf(first) < 0) {
    second.links.push(first)
  }
}
export const disconnect = (first, second) => {
  _pull(first.links, second)
  _pull(second.links, first)
}
export const connectionId = (first, second) => {
  return [first.id, second.id].sort().join(' ')
}

export function recursiveBacktrack(grid) {
  let visited = []
  const carve = node => {
    visited.push(node)
    let neighbours = _shuffle(node.neighbours)
    for (let n of neighbours) {
      let next = n.node
      if (visited.indexOf(next) < 0) {
        connect(node, next)
        // keep track of the layer
        next.z = node.z + n.wrapY
        carve(next)
      }
    }
  }
  // disconnect all
  grid.nodes.forEach(n => n.links = [])
  grid.nodes[0].z = 0
  carve(grid.nodes[0])
}

export function depthFirst(grid) {
  grid.nodes.forEach(n => {
    n.links = []
    n._visited = false
  })
  grid.nodes[0].z = 0

  let remaining = grid.nodes.concat([])
  let stack = []
  let node = remaining.shift()
  node._visited = true
  stack.push(node)
  while (remaining.length > 0){
    let toVisit = node.neighbours.filter(n => !n.node._visited)
    if (!toVisit.length){
      node = stack.pop()
      continue
    }
    let n = _sample(toVisit)
    let next = n.node
    connect(node, next)
    // keep track of the layer
    next.z = node.z + n.wrapY
    node = next
    node._visited = true
    _pull(remaining, node)
    stack.push(node)
  }
}

export function torusGrid(width, depth) {
  const grid = {
    nodes: []
    , width
    , depth
    , getIndex(x, y, mod = true) {
      if (mod) {
        x = ((x % width) + width) % width
        y = ((y % depth) + depth) % depth
      }
      if (x >= width || x < 0) { return -1 }
      if (y >= depth || y < 0) { return -1 }
      return y * width + x
    }
    , get(x, y, mod = true) {
      let i = grid.getIndex(x, y, mod)
      return i >= 0 ? grid.nodes[i] : null
    }
    , getAntiLinks(node) {
      return _difference(node.neighbours.map(n => n.node), node.links)
    }
    , toNormalized(x, y) {
      return { x: x / width, y: y / depth }
    }
    , links() {
      return _uniqWith(
        grid.nodes.reduce((links, n) => {
          let l = n.links.map(second => ({ first: n, second, id: connectionId(n, second) }))
          links.push.apply(links, l)
          return links
        }, [])
        , (a, b) => a.id === b.id
      )
    }
    , walls() {
      let walls = grid.nodes.reduce((walls, n) => {
        let w = grid.getAntiLinks(n).map(second => ({ first: n, second, id: connectionId(n, second) }))
        walls.push.apply(walls, w)
        return walls
      }, [])

      return _uniqWith(walls, (a, b) => a.id === b.id).map(w => {
        let { first, second } = w
        if (first.x === second.x) {
          let y = (second.y - first.y) > 1 ? second.y + 0.5 : first.y + 0.5
          return {
            first: { x: first.x - 0.5, y }
            , second: { x: first.x + 0.5, y }
          }
        } else if (first.y === second.y) {
          let x = (second.x - first.x) > 1 ? second.x + 0.5 : first.x + 0.5
          return {
            first: { x, y: first.y - 0.5 }
            , second: { x, y: first.y + 0.5 }
          }
        } else {
          throw new Error("Unreachable")
        }
      })
    }
  }

  for (let y = 0; y < depth; y++) {
    for (let x = 0; x < width; x++) {
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

export function findSolution(nodes, node, visited = []){
  if (!node){ node = nodes[0] }
  if (node === nodes[nodes.length - 1]){ return [node] }
  for (let i = 0; i < node.links.length; i++){
    let link = node.links[i]
    if (visited.indexOf(link) >= 0){ continue }
    visited.push(link)
    let sol = findSolution(nodes, link, visited)
    if (sol){
      sol.unshift(link)
      return sol
    }
  }
  return false
}

export function addConfoundingLoops(maze, count = 3){
  let pairs = maze.nodes.reduce((acc, n) => {
    if (n.links.length > 1){ return acc }
    let pairs = n.neighbours
      .filter(g => n.z !== g.node.z)
      .map(g => [n, g.node])
    acc.push.apply(acc, pairs)
    return acc
  }, [])

  _sampleSize(pairs, count).forEach(([first, second]) => {
    connect(first, second)
  })
}
