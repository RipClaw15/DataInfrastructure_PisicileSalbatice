# Pure helpers, kept separate so address selection can be tested without Windows.
function Test-LanIPv4 {
    param([string]$Address)
    if ($Address -notmatch '^\d{1,3}(?:\.\d{1,3}){3}$') { return $false }
    $parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($Address, [ref]$parsed)) { return $false }
    if ($parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { return $false }
    $bytes = $parsed.GetAddressBytes()
    return ($bytes[0] -ne 0 -and $bytes[0] -ne 127 -and $bytes[0] -lt 224 -and
            -not ($bytes[0] -eq 169 -and $bytes[1] -eq 254))
}

function Select-LanIPv4 {
    param([object[]]$Networks)
    foreach ($network in ($Networks | Sort-Object { $_.NetIPv4Interface.InterfaceMetric })) {
        if ($network.NetAdapter.Status -ne 'Up') { continue }
        $gateways = @($network.IPv4DefaultGateway | Where-Object { Test-LanIPv4 $_.NextHop })
        if ($gateways.Count -eq 0) { continue }
        foreach ($address in $network.IPv4Address) {
            if ($address.AddressState -ne 'Preferred') { continue }
            if (Test-LanIPv4 $address.IPAddress) { return $address.IPAddress }
        }
    }
    return $null
}
