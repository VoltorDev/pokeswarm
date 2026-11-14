# Modelo 3D (.glb) de la imagen base de un personaje con TRELLIS.2 en local (RTX 5080; unos 2 min con la carga del modelo).
#   powershell -File tools/nico/multiverso/lote4/malla.ps1 -Imagen <base.png con alfa> -Salida <modelo.glb> [-Semilla 42]
# El token de Hugging Face (el extractor de imagen dinov3 es de acceso con licencia) lo pone cred.ps1 desde el llavero de
# Windows sin mostrarlo. Usa la GPU: no lanzar dos a la vez.
param([Parameter(Mandatory = $true)][string]$Imagen, [Parameter(Mandatory = $true)][string]$Salida, [int]$Semilla = 42)
$ErrorActionPreference = 'Continue'
$Imagen = (Resolve-Path $Imagen).Path
$Salida = [System.IO.Path]::GetFullPath($Salida)
$A = 'C:\Users\Nico\Desktop\Claude\asistente-pc\tools\autonomia'
Set-Location 'C:\Users\Nico\Desktop\Claude\herramientas\3d-gen'
& "$A\cred.ps1" -Con HF_TOKEN -Ejecutar ".venv\Scripts\python.exe 3dgen.py malla `"$Imagen`" -o `"$Salida`" -c 512 -s $Semilla"
if (-not (Test-Path $Salida)) { Write-Error "TRELLIS no ha escrito $Salida"; exit 1 }
Write-Output "malla: $Salida ($([math]::Round((Get-Item $Salida).Length / 1MB, 1)) MB)"
