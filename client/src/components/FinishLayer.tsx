import { finishOf, type Finish } from '../finish'

/**
 * Texture overlay for a color (satin / shimmer / metallic / glitter); nothing for matte.
 * Put it first inside an element that has the color as its background (and position: relative).
 */
export default function FinishLayer({ finish }: { finish?: Finish | string | null }) {
  const f = finishOf(finish)
  return f === 'matte' ? null : <span className={'fin fin-' + f} aria-hidden />
}
