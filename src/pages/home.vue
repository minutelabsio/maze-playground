<template lang="pug">
.home
  Torus
</template>

<script>
import Maze from '@/components/Maze'
import Diamond from '@/components/Diamond'
import Torus from '@/components/Torus'

export default {
  name: 'Home'
  , components: {
    Maze
    , Diamond
    , Torus
  }
}
</script>

<style lang="sass" scoped>

</style>
