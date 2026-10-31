import type { CSSProperties, ReactNode } from 'react'
import { gridStyle, panRects, panStyle, type Shape } from '../layout'

/** Lays pans out like the real palette (pans may span several cells). */
export default function PanGrid({ shape, className, style, children }: {
  shape: Shape
  className?: string
  style?: CSSProperties
  /** render pan i; it is placed in its grid area automatically */
  children: (pan: number) => ReactNode
}) {
  return (
    <div className={'pangrid ' + (className ?? '')} style={{ ...gridStyle(shape), ...style }}>
      {panRects(shape).map((rect, i) => (
        <div key={i} className="pan-slot" style={panStyle(rect)}>{children(i)}</div>
      ))}
    </div>
  )
}
