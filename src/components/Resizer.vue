<template lang="pug">
.resizer
  slot
</template>

<script>
import _throttle from 'lodash/throttle'
import Vue from 'vue'

const pubsub = new Vue()
window.addEventListener('resize', _throttle(() => {
  pubsub.$emit('resize')
}, 18))

export default {
  name: 'Resizer'
  , mounted(){
    const listener = () => {
      const width = this.$el.offsetWidth
      const height = this.$el.offsetHeight
      this.$emit('resize', { width, height })
    }

    listener()
    pubsub.$on('resize', listener)
    this.$on('hook:beforeDestroy', () => {
      pubsub.$off('resize', listener)
    })
  }
}
</script>

<style lang="sass" scoped>
.resizer
  width: 100%
  height: 100%
</style>
