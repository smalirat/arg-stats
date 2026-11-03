<#
Despliega ArgStats en la VM de Oracle desde esta PC (Windows PowerShell 5.1 o 7).

Primera vez (prepara la VM y sube el .env del backend):
    .\deploy\desplegar.ps1 -Servidor ubuntu@129.146.10.20 -Llave C:\ruta\oracle.key -Preparar -Dominio argstats.com.ar -SubirEnv

Las siguientes:
    .\deploy\desplegar.ps1 -Servidor ubuntu@129.146.10.20 -Llave C:\ruta\oracle.key

Compila el frontend acá (la VM gratis tiene poca RAM para compilar), arma un
.tar.gz con el backend y el build, lo sube por scp y corre instalar.sh, que
instala, reinicia y vuelve a la versión anterior si algo falla.
#>
param(
    [Parameter(Mandatory = $true)][string]$Servidor,   # usuario@ip
    [Parameter(Mandatory = $true)][string]$Llave,      # clave privada SSH de la VM
    [switch]$Preparar,                                 # corre preparar-servidor.sh antes
    [string]$Dominio,                                  # requerido con -Preparar
    [switch]$SubirEnv                                  # sube app-arg-stats/backend/.env
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$app = Join-Path $repo 'app-arg-stats'
$version = Get-Date -Format 'yyyyMMdd-HHmmss'
$paquete = Join-Path $env:TEMP "argstats-$version.tar.gz"
$ssh = @('-i', $Llave, '-o', 'StrictHostKeyChecking=accept-new')
# El tar de Windows (bsdtar): el de Git Bash toma "C:" como un host remoto
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'

function Paso($texto) { Write-Host "== $texto" -ForegroundColor Cyan }

function Correr {
    param([string]$Programa, [string[]]$Argumentos)
    # En PowerShell 5.1, con Stop, cualquier línea que el programa escriba en stderr (avisos de apt,
    # de npm, de ssh) corta el script aunque termine bien: vale solo el código de salida
    $anterior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Programa @Argumentos 2>&1 | ForEach-Object { "$_" } }
    finally { $ErrorActionPreference = $anterior }
    if ($LASTEXITCODE -ne 0) { throw "$Programa terminó con código $LASTEXITCODE" }
}

if ($Preparar -and -not $Dominio) { throw 'Con -Preparar hace falta -Dominio.' }
if (-not (Test-Path $Llave)) { throw "No existe la llave $Llave" }

if ($Preparar) {
    Paso "Preparando la VM para $Dominio"
    Correr scp ($ssh + @((Join-Path $PSScriptRoot 'preparar-servidor.sh'), "${Servidor}:/tmp/preparar-servidor.sh"))
    Correr ssh ($ssh + @($Servidor, "sudo bash /tmp/preparar-servidor.sh $Dominio"))
}

Paso 'Compilando el frontend'
Push-Location (Join-Path $app 'frontend')
try { Correr npm @('run', 'build') } finally { Pop-Location }

Paso 'Armando el paquete'
# backend sin node_modules ni .env (el .env vive en la VM); del frontend, solo el build y las dependencias
Correr $tar @('-czf', $paquete, '-C', $app,
    '--exclude=backend/node_modules', '--exclude=backend/.env',
    'backend', 'frontend/dist', 'frontend/package.json', 'frontend/package-lock.json')
Write-Host ("   {0:N1} MB" -f ((Get-Item $paquete).Length / 1MB))

Paso 'Subiendo'
$archivos = @($paquete, (Join-Path $PSScriptRoot 'instalar.sh'))
Correr scp ($ssh + $archivos + @("${Servidor}:/tmp/"))
$envRemoto = ''
if ($SubirEnv) {
    Correr scp ($ssh + @((Join-Path $app 'backend\.env'), "${Servidor}:/tmp/backend.env"))
    $envRemoto = '/tmp/backend.env'
}

Paso 'Instalando en la VM'
try {
    Correr ssh ($ssh + @($Servidor, "sudo bash /tmp/instalar.sh /tmp/argstats-$version.tar.gz $envRemoto"))
} finally {
    Remove-Item $paquete -ErrorAction SilentlyContinue
}

Paso "Listo: versión $version"
