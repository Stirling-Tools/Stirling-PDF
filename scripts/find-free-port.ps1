# Prints one free TCP port per preferred port given as an argument.
#
# For each element of -Preferred, emits that port if it's free; otherwise
# emits a random free port in 20000-49999. Uses Get-NetTCPConnection to read
# the OS socket table directly — more reliable than TcpListener binding on
# Windows where SO_REUSEADDR can cause false "free" results. Tracks picks
# within this run so outputs are guaranteed distinct from each other.
param([Parameter(ValueFromRemainingArguments = $true)][int[]]$Preferred)

$script:picked = @()

# Build a set of ports currently in LISTEN or ESTABLISHED state once upfront.
$usedPorts = [System.Collections.Generic.HashSet[int]]::new()
Get-NetTCPConnection -ErrorAction SilentlyContinue |
    Where-Object { $_.State -in 'Listen', 'Established' } |
    ForEach-Object { $null = $usedPorts.Add($_.LocalPort) }

function Test-PortFree {
    param([int]$Port)
    if ($script:picked -contains $Port) { return $false }
    return -not $usedPorts.Contains($Port)
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
    [Console]::Out.Write("$p`n")
}
