# Creates a Desktop shortcut with the OpenExam Hub logo that opens the tracker in the browser.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $Root '..\..')
$IconPath = Join-Path $Root 'openexam-hub.ico'
$Launcher = Join-Path $Root 'OpenExamHub-Tracker.cmd'
$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop 'OpenExam Hub Tracker.lnk'
$MarkSvg = Join-Path $RepoRoot 'public\brand\mark.svg'

Add-Type -AssemblyName System.Drawing

function New-OpenExamIcon {
  param([string]$OutPath)

  $sizes = @(16, 32, 48, 256)
  $pngBytes = @()

  foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(255, 26, 23, 20))

    # Approximate OpenExam Hub mark: navy + terracotta cube facets
    $navy = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 24, 33, 59))
    $navy2 = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 58, 68, 96))
    $orange = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 194, 65, 12))
    $amber = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 249, 115, 22))

    $cx = $size / 2.0
    $cy = $size / 2.0
    $s = $size * 0.34

    $top = @(
      [System.Drawing.PointF]::new($cx, $cy - $s),
      [System.Drawing.PointF]::new($cx + $s * 0.9, $cy - $s * 0.35),
      [System.Drawing.PointF]::new($cx, $cy + $s * 0.15),
      [System.Drawing.PointF]::new($cx - $s * 0.9, $cy - $s * 0.35)
    )
    $left = @(
      [System.Drawing.PointF]::new($cx - $s * 0.9, $cy - $s * 0.35),
      [System.Drawing.PointF]::new($cx, $cy + $s * 0.15),
      [System.Drawing.PointF]::new($cx, $cy + $s),
      [System.Drawing.PointF]::new($cx - $s * 0.9, $cy + $s * 0.45)
    )
    $right = @(
      [System.Drawing.PointF]::new($cx + $s * 0.9, $cy - $s * 0.35),
      [System.Drawing.PointF]::new($cx, $cy + $s * 0.15),
      [System.Drawing.PointF]::new($cx, $cy + $s),
      [System.Drawing.PointF]::new($cx + $s * 0.9, $cy + $s * 0.45)
    )
    $cap = @(
      [System.Drawing.PointF]::new($cx, $cy - $s),
      [System.Drawing.PointF]::new($cx + $s * 0.9, $cy - $s * 0.35),
      [System.Drawing.PointF]::new($cx, $cy + $s * 0.15)
    )

    $g.FillPolygon($navy, $left)
    $g.FillPolygon($orange, $right)
    $g.FillPolygon($navy2, $cap)
    $g.FillPolygon($amber, @(
      [System.Drawing.PointF]::new($cx, $cy - $s),
      [System.Drawing.PointF]::new($cx, $cy + $s * 0.15),
      [System.Drawing.PointF]::new($cx - $s * 0.9, $cy - $s * 0.35)
    ))

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes += , $ms.ToArray()
    $g.Dispose()
    $bmp.Dispose()
    $navy.Dispose(); $navy2.Dispose(); $orange.Dispose(); $amber.Dispose()
    $ms.Dispose()
  }

  # Build multi-resolution ICO
  $fs = [System.IO.File]::Open($OutPath, [System.IO.FileMode]::Create)
  $bw = New-Object System.IO.BinaryWriter $fs
  $bw.Write([uint16]0)      # reserved
  $bw.Write([uint16]1)      # icon type
  $bw.Write([uint16]$sizes.Count)

  $offset = 6 + (16 * $sizes.Count)
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $size = $sizes[$i]
    $data = $pngBytes[$i]
    $iconDim = if ($size -ge 256) { [byte]0 } else { [byte]$size }
    $bw.Write($iconDim)
    $bw.Write($iconDim)
    $bw.Write([byte]0)  # color palette
    $bw.Write([byte]0)  # reserved
    $bw.Write([uint16]1) # planes
    $bw.Write([uint16]32) # bit count
    $bw.Write([uint32]$data.Length)
    $bw.Write([uint32]$offset)
    $offset += $data.Length
  }
  foreach ($data in $pngBytes) { $bw.Write($data) }
  $bw.Flush()
  $bw.Close()
  $fs.Close()
}

if (-not (Test-Path $Launcher)) {
  throw "Launcher missing: $Launcher"
}

New-OpenExamIcon -OutPath $IconPath

$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($ShortcutPath)
$sc.TargetPath = $Launcher
$sc.WorkingDirectory = $Root
$sc.WindowStyle = 7
$sc.Description = 'OpenExam Hub — Free backlink & article tracker (opens in your browser)'
$sc.IconLocation = "$IconPath,0"
$sc.Save()

Write-Output "SHORTCUT $ShortcutPath"
Write-Output "ICON $IconPath"
Write-Output "MARK_REF $MarkSvg"
