import { useState, useEffect, forwardRef } from 'react'
import { Group, Rect, Image as KonvaImage, Text } from 'react-konva'

/**
 * Converts hex color + alpha (0-1) to an rgba() string for Konva fill.
 */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const TeamBlock = forwardRef(function TeamBlock({ team, isSelected, onSelect, onDragEnd }, ref) {
  const [logoImage, setLogoImage] = useState(null)

  // Load logo as HTMLImageElement whenever logoSrc changes
  useEffect(() => {
    if (!team.logoSrc) {
      setLogoImage(null)
      return
    }
    const img = new window.Image()
    img.onload = () => setLogoImage(img)
    img.src = team.logoSrc
  }, [team.logoSrc])

  const padding = team.height * 0.12
  const maxLogoH = team.height - padding * 2
  const maxLogoW = maxLogoH // square area reserved for logo

  // Compute logo dimensions preserving aspect ratio, centered in the square area
  let logoW = 0, logoH = 0, logoX = padding, logoY = padding
  if (logoImage) {
    const aspect = logoImage.naturalWidth / logoImage.naturalHeight
    if (aspect >= 1) {
      logoW = maxLogoW
      logoH = maxLogoW / aspect
    } else {
      logoH = maxLogoH
      logoW = maxLogoH * aspect
    }
    logoX = padding + (maxLogoW - logoW) / 2
    logoY = padding + (maxLogoH - logoH) / 2
  }

  const hasLogo = logoImage && team.logoSrc
  const textX = hasLogo ? padding + maxLogoW + padding : padding
  const textWidth = team.width - textX - padding

  const bgFill = hexToRgba(team.style.bgColor, team.style.bgOpacity)

  return (
    <Group
      ref={ref}
      id={team.id}
      x={team.x}
      y={team.y}
      opacity={team.style.opacity}
      draggable
      onClick={() => onSelect(team.id)}
      onTap={() => onSelect(team.id)}
      onDragEnd={(e) => {
        onDragEnd(team.id, e.target.x(), e.target.y())
      }}
    >
      <Rect
        width={team.width}
        height={team.height}
        fill={bgFill}
        stroke={isSelected ? '#ffffff' : team.style.borderColor}
        strokeWidth={isSelected ? team.style.borderWidth + 1 : team.style.borderWidth}
        cornerRadius={team.style.borderRadius}
      />
      {hasLogo && (
        <KonvaImage
          image={logoImage}
          x={logoX}
          y={logoY}
          width={logoW}
          height={logoH}
        />
      )}
      <Text
        text={team.name || 'Team'}
        x={textX}
        y={0}
        width={Math.max(textWidth, 10)}
        height={team.height}
        verticalAlign="middle"
        fontSize={team.style.fontSize}
        fill={team.style.fontColor}
        fontStyle="bold"
        ellipsis={true}
        wrap="none"
      />
    </Group>
  )
})

export default TeamBlock
