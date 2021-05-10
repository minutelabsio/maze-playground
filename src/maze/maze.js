import _shuffle from 'lodash/shuffle'
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
  const carve = (node, z) => {
    node.z = z
    visited.push(node)
    let neighbours = _shuffle(node.neighbours)
    for (let n of neighbours) {
      let next = n.node
      if (visited.indexOf(next) < 0) {
        connect(node, next)
        // keep track of the layer
        carve(next, z + n.wrapY)
      }
    }
  }
  carve(grid.nodes[0], 0)
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
