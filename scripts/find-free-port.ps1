# Prints N distinct free TCP ports on stdout, one per line.
#
# Binds N TcpListeners to port 0 simultaneously, so the OS assigns N distinct
# ports. Listeners are released once we've collected their ports.
param([int]$Count = 1)

$listeners = @()
for ($i = 0; $i -lt $Count; $i++) {
    $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $l.Start()
    $listeners += $l
}
foreach ($l in $listeners) {
    Write-Output $l.LocalEndpoint.Port
}
foreach ($l in $listeners) {
    $l.Stop()
}
