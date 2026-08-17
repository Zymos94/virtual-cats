// A passively-read mutable singleton, not React state — cats read this
// directly during their own already-happening 60fps render (driven by the
// game loop), so there's no need to trigger extra re-renders on every
// mousemove event, which would fire far more often than needed.
export const mousePosition = { x: -9999, y: -9999 }

window.addEventListener('mousemove', (e) => {
  mousePosition.x = e.clientX
  mousePosition.y = e.clientY
})
