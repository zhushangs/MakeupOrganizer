import Sheet from './Sheet'

/**
 * Shows a generated PNG. On iPhone the reliable way to keep it is long-press → Save to Photos
 * (the Web Share API isn't available over plain http on the LAN). On a computer, use Download.
 */
export default function SaveImageOverlay({ src, fileName, onClose }: { src: string; fileName: string; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <img src={src} alt="Color card" className="save-preview" />
      <div className="hint" style={{ textAlign: 'center', margin: '10px 0 14px' }}>
        On your phone: press and hold the image → <b>Save to Photos</b>
      </div>
      <div className="row">
        <button className="btn" onClick={onClose}>Close</button>
        <a className="btn primary" style={{ textAlign: 'center', textDecoration: 'none' }} href={src} download={fileName}>Download</a>
      </div>
    </Sheet>
  )
}
