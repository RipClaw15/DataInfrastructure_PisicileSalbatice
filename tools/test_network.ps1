$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'network.ps1')

function Assert-True($Condition, $Message) {
    if (-not $Condition) { throw $Message }
}
function Network($Ip, $Metric, $Status = 'Up', $Gateway = '192.168.1.1', $State = 'Preferred') {
    [pscustomobject]@{
        NetAdapter = [pscustomobject]@{ Status = $Status }
        NetIPv4Interface = [pscustomobject]@{ InterfaceMetric = $Metric }
        IPv4DefaultGateway = [pscustomobject]@{ NextHop = $Gateway }
        IPv4Address = @([pscustomobject]@{ IPAddress = $Ip; AddressState = $State })
    }
}
foreach ($ip in @('', 'localhost', 'invalid', '1.2', '0.0.0.0', '127.0.0.1', '169.254.77.142', '::1', '224.0.0.1', '255.255.255.255')) {
    Assert-True (-not (Test-LanIPv4 $ip)) "Should reject $ip"
}
foreach ($ip in @('192.168.1.42', '10.0.0.2', '172.20.10.3')) {
    Assert-True (Test-LanIPv4 $ip) "Should accept $ip"
}
$networks = @(
    (Network '169.254.77.142' 1),
    (Network '192.168.2.42' 2 'Disconnected'),
    (Network '192.168.3.42' 3 'Up' '0.0.0.0'),
    (Network '192.168.4.42' 4 'Up' '192.168.4.1' 'Tentative'),
    (Network '192.168.1.42' 20),
    (Network '10.0.0.2' 30)
)
Assert-True ((Select-LanIPv4 $networks) -eq '192.168.1.42') 'Choose the usable, connected interface with the lowest metric'
Assert-True ($null -eq (Select-LanIPv4 @((Network '169.254.77.142' 1)))) 'Do not select APIPA when no usable address exists'

# Parse the complete launcher too, without invoking Windows networking or Docker.
$tokens = $null
$errors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path (Split-Path $PSScriptRoot) 'start.ps1'), [ref]$tokens, [ref]$errors)
Assert-True ($errors.Count -eq 0) 'Windows launcher must parse without errors'
Write-Host 'PASS: IPv4 validation, APIPA exclusion, interface selection, and launcher syntax'
