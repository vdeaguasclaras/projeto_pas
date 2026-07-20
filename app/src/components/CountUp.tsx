import { useEffect, useRef, useState } from 'react'

const DUR = 1400

/** Contador animado dos KPIs: 0 → valor em 1.4s, easing 1-(1-p)^3, via rAF. */
export function CountUp({ value }: { value: number }) {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(reduced ? value : 0)
  const raf = useRef(0)

  useEffect(() => {
    if (reduced) {
      setShown(value)
      return
    }
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR)
      const e = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(e * value))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, reduced])

  return <span>{shown}</span>
}
