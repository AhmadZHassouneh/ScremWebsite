import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva'
import TeamBlock from './TeamBlock'

/**
 * Computes the base scale to fit the natural image inside a container.
 */
function computeFitScale(imgW, imgH, containerW, containerH) {
  if (!imgW || !imgH || !containerW || !containerH) return 1
  return Math.min(containerW / imgW, containerH / imgH)
}

// Minimum block size in natural image pixels
const MIN_W = 60
const MIN_H = 30

const ZOOM_MIN = 0.1
const ZOOM_MAX = 5
const ZOOM_STEP = 1.15 // each click/wheel tick multiplies/divides by this

const OverlayCanvas = forwardRef(function OverlayCanvas({
  backgroundSrc,
  teams,
  selectedId,
  onSelect,
  onTeamMove,
  onTeamTransform,
  onImageLoaded,
}, ref) {
  const containerRef = useRef(null)
  const stageRef = useRef(null)
  const transformerRef = useRef(null)
  const nodesRef = useRef(new Map())

  const [bgImage, setBgImage] = useState(null)
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })
  const [fitScale, setFitScale] = useState(1)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })

  // Panning via middle-mouse drag
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  // ── Background image loading ──
  useEffect(() => {
    if (!backgroundSrc) { setBgImage(null); return }
    const img = new window.Image()
    img.onload = () => {
      setBgImage(img)
      onImageLoaded?.({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.src = backgroundSrc
  }, [backgroundSrc])

  const naturalW = bgImage?.naturalWidth || 1
  const naturalH = bgImage?.naturalHeight || 1

  // ── Export API ──
  useImperativeHandle(ref, () => ({
    exportImage({ pixelRatio = 1, mimeType = 'image/png', quality = 0.92 }) {
      const stage = stageRef.current
      if (!stage || !bgImage) return null

      const layer = stage.findOne('Layer')
      const transformer = stage.findOne('Transformer')

      // Save current state
      const saved = {
        stageW: stage.width(),
        stageH: stage.height(),
        scaleX: layer.scaleX(),
        scaleY: layer.scaleY(),
        x: layer.x(),
        y: layer.y(),
      }

      // Set to natural size, no zoom/pan
      stage.width(naturalW)
      stage.height(naturalH)
      layer.scaleX(1)
      layer.scaleY(1)
      layer.x(0)
      layer.y(0)
      transformer?.hide()

      let dataURL
      if (mimeType === 'image/jpeg') {
        // JPEG: render onto white background since JPEG has no transparency
        const exportCanvas = stage.toCanvas({ pixelRatio })
        const outCanvas = document.createElement('canvas')
        outCanvas.width = exportCanvas.width
        outCanvas.height = exportCanvas.height
        const ctx = outCanvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, outCanvas.width, outCanvas.height)
        ctx.drawImage(exportCanvas, 0, 0)
        dataURL = outCanvas.toDataURL('image/jpeg', quality)
      } else {
        dataURL = stage.toDataURL({ pixelRatio })
      }

      // Restore
      stage.width(saved.stageW)
      stage.height(saved.stageH)
      layer.scaleX(saved.scaleX)
      layer.scaleY(saved.scaleY)
      layer.x(saved.x)
      layer.y(saved.y)
      transformer?.show()
      layer.batchDraw()

      return dataURL
    },
  }), [bgImage, naturalW, naturalH])

  // ── Container size tracking ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setContainerSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ── Recompute fitScale when container or image changes ──
  useEffect(() => {
    if (!bgImage) return
    const fs = computeFitScale(naturalW, naturalH, containerSize.width, containerSize.height)
    setFitScale(fs)
  }, [bgImage, naturalW, naturalH, containerSize])

  // ── Center & reset zoom when a NEW image loads ──
  useEffect(() => {
    if (!bgImage) return
    const fs = computeFitScale(naturalW, naturalH, containerSize.width, containerSize.height)
    setZoomLevel(1)
    setPanOffset({
      x: (containerSize.width - naturalW * fs) / 2,
      y: (containerSize.height - naturalH * fs) / 2,
    })
  }, [bgImage]) // intentionally only on new image

  /*
   * effectiveScale = fitScale * zoomLevel
   * This is the single scale applied to the Layer. It maps natural image
   * pixels → display pixels at the current zoom level.
   */
  const effectiveScale = fitScale * zoomLevel

  // ── Fit-to-screen (reset zoom + center) ──
  const fitToScreen = useCallback(() => {
    setZoomLevel(1)
    setPanOffset({
      x: (containerSize.width - naturalW * fitScale) / 2,
      y: (containerSize.height - naturalH * fitScale) / 2,
    })
  }, [containerSize, naturalW, naturalH, fitScale])

  /**
   * Zoom toward a given point (in stage/display coords).
   * Keeps the natural-image point under that display point fixed.
   */
  const zoomToward = useCallback((displayX, displayY, newZoom) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom))
    const oldEff = fitScale * zoomLevel
    const newEff = fitScale * clamped

    // Natural-image point currently under (displayX, displayY)
    const natX = (displayX - panOffset.x) / oldEff
    const natY = (displayY - panOffset.y) / oldEff

    setPanOffset({
      x: displayX - natX * newEff,
      y: displayY - natY * newEff,
    })
    setZoomLevel(clamped)
  }, [fitScale, zoomLevel, panOffset])

  // ── Mouse-wheel zoom toward cursor ──
  const handleWheel = useCallback((e) => {
    e.evt.preventDefault()
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    const dir = e.evt.deltaY < 0 ? 1 : -1
    const next = dir > 0 ? zoomLevel * ZOOM_STEP : zoomLevel / ZOOM_STEP
    zoomToward(pointer.x, pointer.y, next)
  }, [zoomLevel, zoomToward])

  // ── Button zoom (toward center of container) ──
  const zoomIn = () => zoomToward(containerSize.width / 2, containerSize.height / 2, zoomLevel * ZOOM_STEP)
  const zoomOut = () => zoomToward(containerSize.width / 2, containerSize.height / 2, zoomLevel / ZOOM_STEP)

  // ── Middle-mouse pan ──
  const handleMouseDown = useCallback((e) => {
    if (e.evt.button === 1) {
      e.evt.preventDefault()
      isPanningRef.current = true
      panStartRef.current = { mx: e.evt.clientX, my: e.evt.clientY, px: panOffset.x, py: panOffset.y }

      const onMove = (me) => {
        if (!isPanningRef.current) return
        setPanOffset({
          x: panStartRef.current.px + (me.clientX - panStartRef.current.mx),
          y: panStartRef.current.py + (me.clientY - panStartRef.current.my),
        })
      }
      const onUp = () => {
        isPanningRef.current = false
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
  }, [panOffset])

  // ── Transformer attachment ──
  useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return
    if (selectedId && nodesRef.current.has(selectedId)) {
      tr.nodes([nodesRef.current.get(selectedId)])
    } else {
      tr.nodes([])
    }
    tr.getLayer()?.batchDraw()
  }, [selectedId, teams])

  // ── Deselect on empty click ──
  const handleStageClick = (e) => {
    if (e.target === e.target.getStage() || e.target.attrs.image === bgImage) {
      onSelect?.(null)
    }
  }

  // ── Transform end ──
  const handleTransformEnd = (e) => {
    const node = e.target
    const teamId = node.id()
    const team = teams.find((t) => t.id === teamId)
    if (!team) return

    const sx = node.scaleX()
    const sy = node.scaleY()
    node.scaleX(1)
    node.scaleY(1)

    const newWidth = Math.max(MIN_W, team.width * sx)
    const newHeight = Math.max(MIN_H, team.height * sy)
    const heightRatio = newHeight / team.height
    const newFontSize = Math.max(8, Math.round(team.style.fontSize * heightRatio))

    onTeamTransform(teamId, {
      x: node.x(),
      y: node.y(),
      width: newWidth,
      height: newHeight,
      style: { ...team.style, fontSize: newFontSize },
    })
  }

  /*
   * Anchor / border sizes are in layer (natural) coords. The layer is scaled
   * by effectiveScale for display, so dividing by effectiveScale keeps them
   * a fixed pixel size on screen regardless of zoom.
   */
  const anchorSize = Math.max(6, 8 / effectiveScale)
  const borderStroke = Math.max(0.5, 1 / effectiveScale)

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minWidth: 300,
        minHeight: 400,
        position: 'relative',
        background: bgImage ? '#0d0d1a' : 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {bgImage ? (
        <>
          <Stage
            ref={stageRef}
            width={containerSize.width}
            height={containerSize.height}
            onClick={handleStageClick}
            onTap={handleStageClick}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
          >
            <Layer
              scaleX={effectiveScale}
              scaleY={effectiveScale}
              x={panOffset.x}
              y={panOffset.y}
            >
              <KonvaImage
                image={bgImage}
                width={naturalW}
                height={naturalH}
                listening={true}
              />
              {teams.map((team) => (
                <TeamBlock
                  key={team.id}
                  ref={(node) => {
                    if (node) nodesRef.current.set(team.id, node)
                    else nodesRef.current.delete(team.id)
                  }}
                  team={team}
                  isSelected={selectedId === team.id}
                  onSelect={onSelect}
                  onDragEnd={onTeamMove}
                />
              ))}
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                enabledAnchors={[
                  'top-left', 'top-center', 'top-right',
                  'middle-left', 'middle-right',
                  'bottom-left', 'bottom-center', 'bottom-right',
                ]}
                anchorSize={anchorSize}
                anchorCornerRadius={anchorSize * 0.3}
                anchorStroke="#00c9a7"
                anchorFill="#ffffff"
                borderStroke="#00c9a7"
                borderStrokeWidth={borderStroke}
                borderDash={[4 / effectiveScale, 4 / effectiveScale]}
                onTransformEnd={handleTransformEnd}
                boundBoxFunc={(oldBox, newBox) => {
                  if (Math.abs(newBox.width) < MIN_W * effectiveScale || Math.abs(newBox.height) < MIN_H * effectiveScale) {
                    return oldBox
                  }
                  return newBox
                }}
              />
            </Layer>
          </Stage>

          {/* ── Zoom controls overlay ── */}
          <div style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'rgba(10, 10, 20, 0.85)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '4px 6px',
            userSelect: 'none',
          }}>
            <ZoomBtn onClick={zoomOut} title="Zoom out">−</ZoomBtn>
            <span style={{
              color: 'var(--text)',
              fontSize: '0.75rem',
              width: 42,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <ZoomBtn onClick={zoomIn} title="Zoom in">+</ZoomBtn>
            <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
            <ZoomBtn onClick={fitToScreen} title="Fit to screen" wide>Fit</ZoomBtn>
          </div>

          {/* Pan hint (only when zoomed in) */}
          {zoomLevel > 1.05 && (
            <div style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              color: 'var(--text-muted)',
              fontSize: '0.7rem',
              background: 'rgba(10, 10, 20, 0.75)',
              borderRadius: 6,
              padding: '3px 8px',
              pointerEvents: 'none',
            }}>
              Middle-click drag to pan
            </div>
          )}
        </>
      ) : (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text)',
          textAlign: 'center',
          padding: 40,
          border: '2px dashed var(--border)',
          borderRadius: 8,
          margin: 12,
        }}>
          <div>
            <div style={{ fontSize: '3rem', marginBottom: 12, color: 'var(--primary)', opacity: 0.7 }}>+</div>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>Upload a background image to start</p>
          </div>
        </div>
      )}
    </div>
  )
})

export default OverlayCanvas

function ZoomBtn({ onClick, title, children, wide }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        color: 'var(--text)',
        cursor: 'pointer',
        width: wide ? 36 : 26,
        height: 26,
        fontSize: wide ? '0.7rem' : '1rem',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}
