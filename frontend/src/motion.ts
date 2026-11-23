import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

gsap.registerPlugin(ScrollTrigger)

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

let lenis: Lenis | null = null

// One Lenis instance for the whole app, driven by GSAP's ticker so ScrollTrigger stays in sync.
export function startSmoothScroll() {
  if (lenis || reducedMotion()) return lenis
  lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (time: number) => lenis?.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)
  return lenis
}

export function getLenis() {
  return lenis
}

export function scrollToTop(immediate = false) {
  if (lenis) lenis.scrollTo(0, { immediate, force: true })
  else window.scrollTo({ top: 0, behavior: immediate ? 'instant' : 'smooth' })
}

export function scrollToElement(element: HTMLElement, offset = -100) {
  if (lenis) lenis.scrollTo(element, { offset, duration: 1.2 })
  else element.scrollIntoView({ behavior: 'smooth' })
}

// Fade-and-rise every [data-reveal] element inside root as it enters the viewport.
export function revealOnScroll(root: HTMLElement) {
  if (reducedMotion()) return () => {}
  const ctx = gsap.context(() => {
    const items = gsap.utils.toArray<HTMLElement>('[data-reveal]', root)
    gsap.set(items, { y: 28, autoAlpha: 0 })
    ScrollTrigger.batch(items, {
      start: 'top 88%',
      once: true,
      onEnter: (batch) => gsap.to(batch, { y: 0, autoAlpha: 1, duration: 0.9, ease: 'expo.out', stagger: 0.08 }),
    })
  }, root)
  ScrollTrigger.refresh()
  return () => ctx.revert()
}

export { gsap, ScrollTrigger }
