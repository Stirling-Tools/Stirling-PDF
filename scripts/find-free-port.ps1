# Prints one free TCP port per preferred port given as an argument.
#
# For each element of -Preferred, emits that port if it's free; otherwise
# emits a random free port in 20000-49999. Probes by attempting to bind a
# TcpListener on loopback. Tracks picks within this run so outputs are
# guaranteed distinct from each other.
param([int[]]$Preferred)

$script:picked = @()

function Test-PortFree {
    param([int]$Port)
    if ($script:picked -contains $Port) { return $false }
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

function Get-RandomFreePort {
    while ($true) {
        $port = Get-Random -Minimum 20000 -Maximum 50000
        if (Test-PortFree $port) { return $port }
    }
}

foreach ($p in $Preferred) {
    if (Test-PortFree $p) {
        $script:picked += $p
    } else {
        $script:picked += Get-RandomFreePort
    }
}

foreach ($p in $script:picked) {
    Write-Output $p
}
