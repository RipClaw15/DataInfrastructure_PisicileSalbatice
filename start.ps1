# One-command local setup for Windows. Requires only Docker Desktop with Compose.
param([switch]$WebOnly)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. (Join-Path $PSScriptRoot 'tools/network.ps1')

function Confirm-DockerCommand {
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker command failed. Check the service logs printed above.'
    }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Install and start Docker Desktop first.'
}
docker compose version
Confirm-DockerCommand
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, then run this command again.' }

$previousLanIp = $env:LAN_IP
try {
    if (-not $WebOnly) {
        # Let Compose parse an optional .env rather than executing its contents.
        $composeEnvironment = docker compose config --environment
        Confirm-DockerCommand
        $configuredIp = $composeEnvironment | Where-Object { $_ -match '^LAN_IP=' } | Select-Object -Last 1
        $lanIp = if ($configuredIp) { $configuredIp.Substring(7).Trim() } else { '' }
        if ($lanIp -and -not (Test-LanIPv4 $lanIp)) {
            throw "LAN_IP '$lanIp' is not a usable IPv4 address. Clear LAN_IP in .env/the environment and retry on Wi-Fi."
        }
        if (-not $lanIp) {
            $lanIp = Select-LanIPv4 @(Get-NetIPConfiguration)
        }
        if (-not $lanIp) {
            throw 'No usable network address found. Connect to Wi-Fi and retry, or use .\start.ps1 -WebOnly.'
        }
        $env:LAN_IP = $lanIp
        Write-Host "Using laptop address: $lanIp (phone and laptop must share a network)."
        docker compose --profile mobile up --build -d --wait --wait-timeout 180
    } else {
        docker compose up --build -d --wait --wait-timeout 180
    }
    $startupExit = $LASTEXITCODE
    if ($startupExit -ne 0) {
        docker compose --profile mobile ps -a
        docker compose --profile mobile logs --tail=60 app mobile
        throw "Docker startup failed (exit $startupExit). See the service logs above."
    }
    $published = docker compose port app 8000 | Select-Object -First 1
    Confirm-DockerCommand
    $appPort = ($published -split ':')[-1]
    Write-Host "Dashboard: http://localhost:$appPort/dashboard/"
    Write-Host "API docs:  http://localhost:$appPort/docs"
    if (-not $WebOnly) {
        $metroPort = (docker compose exec -T mobile printenv METRO_PORT).Trim()
        Confirm-DockerCommand
        Write-Host "Open in Expo Go: exp://${lanIp}:$metroPort"
        Write-Host 'Then tap Show dashboard code in the phone app and enter it in the dashboard.'
    }
    Write-Host 'Stop: docker compose --profile mobile down'
} finally {
    $env:LAN_IP = $previousLanIp
}
