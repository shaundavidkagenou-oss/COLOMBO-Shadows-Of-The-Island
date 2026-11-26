# COLOMBO: Shadows of the Island - writes the CD folder into a burnable .iso image (build-cd.bat calls this).
# Uses the Windows built-in disc-image API (IMAPI2), so nothing has to be installed. ISO 9660 + Joliet + UDF.
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Iso,
  [string]$Label = 'COLOMBO'
)
$ErrorActionPreference = 'Stop'
if (-not ('ColomboIso' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices.ComTypes;
public static class ColomboIso {
  public static void Write(string path, object stream, int blockSize, int totalBlocks) {
    IStream s = (IStream)stream;
    byte[] buf = new byte[blockSize];
    using (FileStream o = File.Create(path)) {
      for (int i = 0; i < totalBlocks; i++) { s.Read(buf, blockSize, IntPtr.Zero); o.Write(buf, 0, blockSize); }
    }
  }
}
'@
}
$src = (Resolve-Path -LiteralPath $Source).Path
$bytes = (Get-ChildItem -LiteralPath $src -Recurse -File | Measure-Object -Property Length -Sum).Sum
# 2 = CD-R (700 MB disc); anything bigger needs a DVD (6 = DVD+R, 4.7 GB)
if ($bytes -le 680MB) { $media = 2; $kind = 'CD' } else { $media = 6; $kind = 'DVD'; Write-Host "      The files ($([math]::Round($bytes / 1MB)) MB) do not fit on a 700 MB CD - making a DVD image instead." }
$fsi = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
$fsi.ChooseImageDefaultsForMediaType($media)
$fsi.FileSystemsToCreate = 7
$fsi.VolumeName = $Label
$fsi.Root.AddTree($src, $false)
$img = $fsi.CreateResultImage()
if (Test-Path -LiteralPath $Iso) { Remove-Item -LiteralPath $Iso -Force }
[ColomboIso]::Write($Iso, $img.ImageStream, $img.BlockSize, $img.TotalBlocks)
Write-Host ("      {0} image: {1} ({2} MB)" -f $kind, $Iso, [math]::Round((Get-Item -LiteralPath $Iso).Length / 1MB))
