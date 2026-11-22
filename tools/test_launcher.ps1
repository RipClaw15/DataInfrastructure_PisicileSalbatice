# Run the real launcher with a Docker substitute that models closed output pipes.
$ErrorActionPreference = 'Stop'
$previousExitCode = $LASTEXITCODE
$global:StayPutDockerTestState = @{ Calls = @(); FailPort = $false }

function docker {
    $command = $args -join ' '
    $global:StayPutDockerTestState.Calls += $command
    $global:LASTEXITCODE = 0
    switch -Wildcard ($command) {
        'compose version' { 'Docker Compose test'; return }
        'info' { return }
        'compose config --environment' { 'LAN_IP=192.168.1.145'; return }
        'compose *up --build -d --wait --wait-timeout 180' { 'All containers healthy'; return }
        'compose port app 8000' {
            if ($global:StayPutDockerTestState.FailPort) { $global:LASTEXITCODE = 17; return }
            # Select-Object -First 1 stops this producer before it completes,
            # just as a native CLI may fail when its output pipe closes early.
            $completed = $false
            try {
                '0.0.0.0:8000'
                '[::]:8000'
                $completed = $true
            } finally {
                if (-not $completed) { $global:LASTEXITCODE = 141 }
            }
            return
        }
        'compose exec -T mobile printenv METRO_PORT' { '8081'; return }
        default { throw "Unexpected Docker command: $command" }
    }
}

$launcher = Join-Path (Split-Path $PSScriptRoot) 'start.ps1'
$previousLanIp = $env:LAN_IP
try {
    $env:LAN_IP = '10.0.0.12'
    $output = & $launcher 6>&1 | Out-String
    if ($output -notmatch 'Dashboard: http://localhost:8000/dashboard/') { throw 'Dashboard URL missing' }
    if ($output -notmatch 'exp://192.168.1.145:8081') { throw 'Expo URL missing' }
    if ($env:LAN_IP -ne '10.0.0.12') { throw 'Environment override was not restored' }

    $global:StayPutDockerTestState.Calls = @()
    $output = & $launcher -WebOnly 6>&1 | Out-String
    if ($output -notmatch 'Dashboard: http://localhost:8000/dashboard/') { throw 'Web-only dashboard URL missing' }
    if (($global:StayPutDockerTestState.Calls -join ',') -match 'exec -T mobile') { throw 'Web-only run must not query Expo' }

    $global:StayPutDockerTestState.FailPort = $true
    $caught = $false
    try { & $launcher -WebOnly | Out-Null } catch {
        $caught = $true
        if ($_.Exception.Message -notmatch 'published app port.*17') { throw }
    }
    if (-not $caught) { throw 'A genuine Docker port error must still fail' }
    Write-Host 'PASS: complete launcher, dual-stack port output, web-only startup, environment restoration, and genuine Docker errors'
} finally {
    $env:LAN_IP = $previousLanIp
    Remove-Variable StayPutDockerTestState -Scope Global
    $global:LASTEXITCODE = $previousExitCode
}
