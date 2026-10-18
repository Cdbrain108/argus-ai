import { useEffect, useMemo, useRef, useState } from 'react'

/* Locks page scroll while an overlay panel is open. Without it the page scrolls
   under the drawer on touch devices and the panel appears to drift. Used by both
   the landing navbar and the workspace sidebar, which is why it lives here
   rather than in either component. */

/* Dynamic viewport hook — returns the effective viewport height accounting for
   mobile browser chrome (address bar) that shrinks when scrolling. Uses the
   visual viewport API when available and falls back to a resize-based estimate.
   Safe for SSR: returns window height during pre-render. */
export function useDynamicViewport() {
  const [height, setHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 0
  )

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    function update() {
      // `window.visualViewport` is the most accurate on modern mobile browsers:
      // it reflects the actual visible area after chrome collapses.
      if (window.visualViewport) {
        setHeight(window.visualViewport.height)
      } else {
        // Fallback: fall back to `innerHeight` which updates on chrome hide/show.
        setHeight(window.innerHeight)
      }
    }

    update()
    window.addEventListener('resize', update)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update)
      window.visualViewport.addEventListener('scroll', update)
    }
    return () => {
      window.removeEventListener('resize', update)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', update)
        window.visualViewport.removeEventListener('scroll', update)
      }
    }
  }, [])

  return height
}

/* Returns true on touch-only devices, false on hybrid / desktop. Used to
   conditionally render touch-friendly controls (larger hit targets, no hover
   affordances) while keeping fine-grained mouse interactions on desktop. */
export function useTouchDevice() {
  const [isTouch, setIsTouch] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const hasTouch =
      'ontouchstart' in window || navigator.maxTouchPoints > 0
    const prefersTouch = window.matchMedia?.('(hover: none)').matches ?? false
    setIsTouch(hasTouch && prefersTouch)
  }, [])
  return isTouch
}

/* Element-based container query. Returns the element's content-box dimensions.
   Used for components that need to know their own width (not the viewport), so
   they can reflow their internals, e.g. switching a stats grid from 4 cols to
   2 cols when the panel itself (not the whole window) gets narrow. Falls back
   to 0x0 on SSR / browsers without ResizeObserver. */
export function useContainerQuery(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined

    const update = () => {
      const cr = el.getBoundingClientRect()
      setSize({ width: cr.width, height: cr.height })
    }

    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [ref])

  return size
}

/* Convenience: returns true when the element is narrower than breakpoint.
   Perfect for a component that wants to switch layout based on its own
   container width rather than the viewport. */
export function useContainerNarrow(ref, breakpoint = 480) {
  const { width } = useContainerQuery(ref)
  return width > 0 && width < breakpoint
}

/* Watches a CSS media query and re-renders on match changes. */
export function useMediaQuery(query, initialValue = false) {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia(query).matches
    }
    return initialValue
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      setMatches(initialValue)
      return undefined
    }

    const mq = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)

    setMatches(mq.matches)
    mq.addEventListener?.('change', onChange)
    mq.addListener?.(onChange) // Safari fallback
    return () => {
      mq.removeEventListener?.('change', onChange)
      mq.removeListener?.(onChange)
    }
  }, [query, initialValue])

  return matches
}

export function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [locked])
}

/* True when the visitor has asked their OS to reduce motion. Every hook below
   checks this and jumps straight to the final state, matching how the
   typewriter in Landing.jsx already short-circuits. */
function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/* Reveals an element the first time it scrolls into view.

   Returns [ref, shown]. Attach the ref, then key a class off `shown` — the CSS
   does the actual fade and rise, so nothing animates on the main thread.

   IntersectionObserver rather than a scroll listener: a scroll handler fires on
   every frame of every scroll for the lifetime of the page, and `once` lets the
   observer disconnect itself the moment it has done its job. */
export function useReveal({ threshold = 0.05, once = true, rootMargin = '40px 0px 40px 0px' } = {}) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    // Server-rendered or very old browsers: show the content rather than
    // leaving it permanently invisible behind an animation that never runs.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return undefined
    }

    const scrollContainer = node.closest('.landing-scroll') || null

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setShown(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setShown(false)
        }
      })
    }, {
      root: scrollContainer,
      threshold,
      rootMargin,
    })

    observer.observe(node)

    // Immediate check in case container is already visible on mount
    try {
      const rootRect = scrollContainer
        ? scrollContainer.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight }
      const nodeRect = node.getBoundingClientRect()
      if (nodeRect.top < rootRect.bottom && nodeRect.bottom > rootRect.top) {
        setShown(true)
      }
    } catch {
      // ignore fallback
    }

    return () => observer.disconnect()
  }, [threshold, once, rootMargin])

  return [ref, shown]
}

/* Counts a number up once its container is visible.

   Takes the display string the design already uses ('13+', '110+', '★') and
   returns a string of the same shape, so a non-numeric stat like '★' passes
   through untouched instead of rendering as NaN. */
export function useCountUp(display, active, { duration = 1100 } = {}) {
  const match = String(display).match(/^(\D*)(\d[\d,.]*)(.*)$/)
  const target = match ? Number(match[2].replace(/,/g, '')) : null
  const [value, setValue] = useState(() => (
    target === null || prefersReducedMotion() ? target : 0
  ))

  useEffect(() => {
    if (target === null || !active || prefersReducedMotion()) return undefined
    let frame
    const start = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration)
      // easeOutCubic: fast at first, settling rather than stopping dead.
      setValue(Math.round(target * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, active, duration])

  if (target === null) return String(display)
  const [, prefix, , suffix] = match
  return `${prefix}${(value ?? 0).toLocaleString()}${suffix}`
}

/* True once the page has scrolled past `px`. Drives the navbar's condensed
   state. Passive listener so it never blocks scrolling. */
export function useScrolled(px = 24) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > px)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [px])

  return scrolled
}

/* Auto-advancing index for a stepped demo, with the controls a visitor expects.

   Returns { index, setIndex, setPaused }. The caller is expected to pass
   `active: false` while the demo is off-screen — an animation nobody is looking
   at is pure battery cost — and to wire `setPaused` to pointer enter/leave so
   the step under the cursor stops moving out from under it.

   One timeout per step keyed off `index`, not an interval: a throttled tab
   resumes on the step it was on instead of fast-forwarding through a backlog. */
export function useCycle(length, { interval = 3800, active = true } = {}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  // Reset to first step whenever the component scrolls into view
  useEffect(() => {
    if (active) {
      setIndex(0)
    }
  }, [active])

  useEffect(() => {
    if (!active || paused || length < 2) return undefined
    const timer = setTimeout(() => setIndex((i) => (i + 1) % length), interval)
    return () => clearTimeout(timer)
  }, [index, active, paused, length, interval])

  return { index, setIndex, setPaused }
}

/* False on the first paint, true a beat later.

   This is the flip that lets a CSS *transition* run on mount, which is what
   makes a bar grow or a gauge sweep round rather than simply appearing full. A
   single requestAnimationFrame is not enough: it fires before the first paint,
   so the browser only ever sees the final value and has nothing to animate
   from. A short timeout guarantees two separate paints. */
export function useMountFlag(delay = 40) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setOn(true), delay)
    return () => clearTimeout(timer)
  }, [delay])
  return on
}

/* Types a block of prose out word by word.

   Returns { text, done, skip } — render `text`, show a cursor while `!done`,
   and wire `skip` to a click so an impatient reader is never held hostage by
   the animation.

   Word by word rather than character by character: at ~70ms a word the reader
   can actually keep up, and a per-character timer on a 150-word paragraph is
   900 renders instead of 150. One timeout per word (not an interval) means the
   pace is honoured even when the tab is throttled, and the whole thing
   short-circuits to the finished text under prefers-reduced-motion. */
export function useTypedText(source, { delay = 18, chunkSize = 3, active = true } = {}) {
  const text = typeof source === 'string' ? source : ''
  const words = useMemo(() => (text ? text.split(/(\s+)/) : []), [text])
  // Whitespace is captured in the split so newlines survive; non-blank chunks
  // advance the counter in fast multi-word chunks.
  const total = words.length
  const instant = !active || !text || prefersReducedMotion()
  const [count, setCount] = useState(() => (instant ? total : 0))

  useEffect(() => { setCount(instant ? total : 0) }, [text, instant, total])

  useEffect(() => {
    if (instant || count >= total) return undefined
    let nextCount = count
    let wordsCounted = 0
    while (nextCount < total && wordsCounted < chunkSize) {
      if (words[nextCount] && words[nextCount].trim()) {
        wordsCounted++
      }
      nextCount++
    }
    const timer = setTimeout(() => setCount(Math.min(total, Math.max(count + 1, nextCount))), delay)
    return () => clearTimeout(timer)
  }, [count, total, delay, chunkSize, instant, words])

  return {
    text: count >= total ? text : words.slice(0, count).join(''),
    done: count >= total,
    skip: () => setCount(total),
  }
}
